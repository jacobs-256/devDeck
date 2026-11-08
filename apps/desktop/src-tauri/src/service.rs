//! Small loopback status service controlled from Settings.
//!
//! It is intentionally read-only: `/health` and a tiny HTML status page. The
//! configured port is persisted; when it is busy and "auto" is enabled the
//! service binds an ephemeral port instead.

use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tiny_http::{Header, Response, Server, StatusCode};

use devdeck_contract::DevDeckError;

struct Running {
    port: u16,
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub port: u16,
    pub auto_select: bool,
    pub active_port: u16,
    pub running: bool,
}

pub struct ServiceManager {
    inner: Mutex<Option<Running>>,
}

impl Default for ServiceManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ServiceManager {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    /// Start (or restart) the service. Returns the active port.
    pub fn start(&self, requested: u16, auto: bool, version: &str) -> Result<u16, DevDeckError> {
        self.stop();
        let server = match Server::http(("127.0.0.1", requested)) {
            Ok(server) => server,
            Err(error) if auto => Server::http(("127.0.0.1", 0)).map_err(|fallback| {
                DevDeckError::Internal(format!(
                    "failed to bind service port {requested} ({error}) or a fallback ({fallback})"
                ))
            })?,
            Err(error) => {
                return Err(DevDeckError::InvalidArgument(format!(
                    "service port {requested} is unavailable: {error}"
                )));
            }
        };
        let port = server
            .server_addr()
            .to_ip()
            .map(|addr| addr.port())
            .unwrap_or(requested);
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = stop.clone();
        let app_version = version.to_string();
        let handle = std::thread::spawn(move || {
            while !thread_stop.load(Ordering::Relaxed) {
                match server.recv_timeout(Duration::from_millis(300)) {
                    Ok(Some(request)) => respond(request, &app_version),
                    Ok(None) => {}
                    Err(_) => break,
                }
            }
        });
        if let Ok(mut inner) = self.inner.lock() {
            *inner = Some(Running {
                port,
                stop,
                handle: Some(handle),
            });
        }
        Ok(port)
    }

    pub fn stop(&self) {
        let running = self.inner.lock().ok().and_then(|mut inner| inner.take());
        if let Some(mut running) = running {
            running.stop.store(true, Ordering::Relaxed);
            if let Some(handle) = running.handle.take() {
                let _ = handle.join();
            }
        }
    }

    pub fn active_port(&self) -> Option<u16> {
        self.inner
            .lock()
            .ok()
            .and_then(|inner| inner.as_ref().map(|run| run.port))
    }
}

fn respond(request: tiny_http::Request, version: &str) {
    let url = request.url().split('?').next().unwrap_or("/");
    let (status, content_type, body) = match url {
        "/health" => (
            200,
            "application/json; charset=utf-8",
            format!("{{\"name\":\"DevDeck\",\"version\":\"{version}\",\"status\":\"ok\"}}"),
        ),
        "/" => (
            200,
            "text/html; charset=utf-8",
            format!(
                "<!doctype html><meta charset=\"utf-8\"><title>DevDeck</title>\
                 <style>body{{font-family:system-ui;margin:40px;background:#0d1117;color:#e6edf3}}\
                 code{{color:#58a6ff}}</style>\
                 <h1>DevDeck</h1><p>Version <code>{version}</code> is running.</p>\
                 <p>Health: <a href=\"/health\">/health</a></p>"
            ),
        ),
        _ => (404, "text/plain; charset=utf-8", "Not found".to_string()),
    };
    let header =
        Header::from_bytes("Content-Type", content_type).expect("static content type is valid");
    let response = Response::new(
        StatusCode(status),
        vec![header],
        Cursor::new(body.into_bytes()),
        None,
        None,
    );
    let _ = request.respond(response);
}
