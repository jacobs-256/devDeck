//! Local WebSocket server used by the WebSocket tester.
//!
//! The UI's server mode accepts client connections, broadcasts messages, and
//! reports client/status events. TLS is intentionally rejected until a native
//! TLS listener is wired in.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio_tungstenite::tungstenite::Message;

use devdeck_contract::DevDeckError;

pub type EventSink = Arc<dyn Fn(serde_json::Value) + Send + Sync>;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientInfo {
    id: String,
    remote: String,
    connected_at: String,
    recv_count: u64,
    sent_count: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStats {
    total_recv: u64,
    total_sent: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub running: bool,
    pub url: String,
    pub tls: bool,
    pub clients: Vec<ClientInfo>,
    pub stats: ServerStats,
}

struct Client {
    info: ClientInfo,
    tx: UnboundedSender<Message>,
}

struct Running {
    url: String,
    tls: bool,
    stop: Arc<AtomicBool>,
    accept_task: tokio::task::JoinHandle<()>,
    clients: Arc<Mutex<HashMap<String, Client>>>,
    stats: Arc<Mutex<ServerStats>>,
}

pub struct WsServerManager {
    inner: Mutex<Option<Running>>,
    emit: EventSink,
}

impl WsServerManager {
    pub fn new(emit: EventSink) -> Self {
        Self {
            inner: Mutex::new(None),
            emit,
        }
    }

    pub fn status(&self) -> ServerStatus {
        let Ok(inner) = self.inner.lock() else {
            return ServerStatus::default();
        };
        let Some(running) = inner.as_ref() else {
            return ServerStatus::default();
        };
        status_for(running)
    }

    pub async fn start(
        &self,
        host: &str,
        port: u16,
        path: &str,
        tls: bool,
    ) -> Result<ServerStatus, DevDeckError> {
        if tls {
            return Err(DevDeckError::Unsupported(
                "TLS WebSocket server mode is not supported yet".to_string(),
            ));
        }
        if port == 0 {
            return Err(DevDeckError::InvalidArgument(
                "port must be between 1 and 65535".to_string(),
            ));
        }
        let path = normalize_path(path);
        self.stop();

        let bind_host = host.trim();
        let bind_host = if bind_host.is_empty() {
            "0.0.0.0"
        } else {
            bind_host
        };
        let listener = TcpListener::bind((bind_host, port)).await.map_err(|err| {
            DevDeckError::Internal(format!("cannot listen on {bind_host}:{port}: {err}"))
        })?;
        let actual_port = listener
            .local_addr()
            .map_err(|err| DevDeckError::Internal(format!("cannot read listener address: {err}")))?
            .port();
        let url = format!("ws://{bind_host}:{actual_port}{path}");

        let clients: Arc<Mutex<HashMap<String, Client>>> = Arc::new(Mutex::new(HashMap::new()));
        let stats = Arc::new(Mutex::new(ServerStats::default()));
        let stop = Arc::new(AtomicBool::new(false));
        self.emit_log("info", &format!("Server listening on {url}"));

        let accept_clients = clients.clone();
        let accept_stats = stats.clone();
        let accept_stop = stop.clone();
        let accept_emit = self.emit.clone();
        let accept_url = url.clone();
        let accept_task = tokio::spawn(async move {
            loop {
                if accept_stop.load(Ordering::Relaxed) {
                    break;
                }
                let accepted =
                    tokio::time::timeout(Duration::from_millis(250), listener.accept()).await;
                let Ok(Ok((stream, peer))) = accepted else {
                    continue;
                };
                let id = format!("c{}", short_id());
                let (tx, rx) = unbounded_channel();
                let info = ClientInfo {
                    id: id.clone(),
                    remote: peer.to_string(),
                    connected_at: now_text(),
                    recv_count: 0,
                    sent_count: 0,
                };
                if let Ok(mut map) = accept_clients.lock() {
                    map.insert(
                        id.clone(),
                        Client {
                            info: info.clone(),
                            tx,
                        },
                    );
                }
                emit_status(
                    &accept_emit,
                    &accept_clients,
                    &accept_stats,
                    true,
                    &accept_url,
                    false,
                );
                accept_emit(serde_json::json!({
                    "type": "log",
                    "level": "info",
                    "message": format!("Client connected: {} ({})", id, peer),
                }));
                spawn_client(
                    stream,
                    id,
                    rx,
                    accept_clients.clone(),
                    accept_stats.clone(),
                    accept_emit.clone(),
                    accept_url.clone(),
                );
            }
        });

        if let Ok(mut inner) = self.inner.lock() {
            *inner = Some(Running {
                url: url.clone(),
                tls,
                stop,
                accept_task,
                clients,
                stats,
            });
        }
        Ok(self.status())
    }

    pub fn stop(&self) {
        let running = self.inner.lock().ok().and_then(|mut inner| inner.take());
        if let Some(running) = running {
            running.stop.store(true, Ordering::Relaxed);
            running.accept_task.abort();
            if let Ok(mut clients) = running.clients.lock() {
                for client in clients.values() {
                    let _ = client.tx.send(Message::Close(None));
                }
                clients.clear();
            }
            self.emit_status(
                false,
                &running.url,
                &running.clients,
                &running.stats,
                running.tls,
            );
            self.emit_log("info", "Server stopped");
        }
    }

    pub fn send(&self, client_id: Option<&str>, data: &str) -> Result<usize, DevDeckError> {
        let (clients, stats, running) = {
            let Ok(inner) = self.inner.lock() else {
                return Err(DevDeckError::Internal("server lock poisoned".to_string()));
            };
            let Some(running) = inner.as_ref() else {
                return Err(DevDeckError::NotFound(
                    "WebSocket server is not running".to_string(),
                ));
            };
            (
                running.clients.clone(),
                running.stats.clone(),
                running.url.clone(),
            )
        };
        let clients = clients
            .lock()
            .map_err(|_| DevDeckError::Internal("client lock poisoned".to_string()))?;
        let mut sent = 0;
        for (id, client) in clients.iter() {
            if client_id.is_some_and(|wanted| wanted != id) {
                continue;
            }
            if client
                .tx
                .send(Message::Text(data.to_string().into()))
                .is_ok()
            {
                sent += 1;
            }
        }
        if let Ok(mut stats) = stats.lock() {
            stats.total_sent += sent as u64;
        }
        self.emit_log("info", &format!("send {sent} client(s): {data}"));
        self.emit_status(true, &running, &clients_from(&clients), &stats, false);
        Ok(sent)
    }

    pub fn kick(&self, client_id: &str) -> Result<(), DevDeckError> {
        let running = self
            .inner
            .lock()
            .map_err(|_| DevDeckError::Internal("server lock poisoned".to_string()))?;
        let Some(running) = running.as_ref() else {
            return Err(DevDeckError::NotFound(
                "WebSocket server is not running".to_string(),
            ));
        };
        if let Ok(mut clients) = running.clients.lock() {
            if let Some(client) = clients.remove(client_id) {
                let _ = client.tx.send(Message::Close(None));
            }
        }
        self.emit_log("info", &format!("Client kicked: {client_id}"));
        Ok(())
    }

    fn emit_log(&self, level: &str, message: &str) {
        (self.emit)(serde_json::json!({
            "type": "log",
            "level": level,
            "message": message,
        }));
    }

    fn emit_status(
        &self,
        running: bool,
        url: &str,
        clients: &Arc<Mutex<HashMap<String, Client>>>,
        stats: &Arc<Mutex<ServerStats>>,
        tls: bool,
    ) {
        emit_status(&self.emit, clients, stats, running, url, tls);
    }
}

fn clients_from(map: &HashMap<String, Client>) -> Arc<Mutex<HashMap<String, Client>>> {
    Arc::new(Mutex::new(
        map.iter()
            .map(|(id, client)| {
                (
                    id.clone(),
                    Client {
                        info: client.info.clone(),
                        tx: client.tx.clone(),
                    },
                )
            })
            .collect(),
    ))
}

fn status_for(running: &Running) -> ServerStatus {
    let clients = running
        .clients
        .lock()
        .map(|map| map.values().map(|client| client.info.clone()).collect())
        .unwrap_or_default();
    let stats = running
        .stats
        .lock()
        .map(|stats| stats.clone())
        .unwrap_or_default();
    ServerStatus {
        running: true,
        url: running.url.clone(),
        tls: running.tls,
        clients,
        stats,
    }
}

fn emit_status(
    emit: &EventSink,
    clients: &Arc<Mutex<HashMap<String, Client>>>,
    stats: &Arc<Mutex<ServerStats>>,
    running: bool,
    url: &str,
    tls: bool,
) {
    let clients = clients
        .lock()
        .map(|map| map.values().map(|client| client.info.clone()).collect())
        .unwrap_or_default();
    let stats = stats.lock().map(|stats| stats.clone()).unwrap_or_default();
    emit(serde_json::json!({
        "type": "status",
        "status": ServerStatus { running, url: url.to_string(), tls, clients, stats },
    }));
}

fn spawn_client(
    stream: tokio::net::TcpStream,
    id: String,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<Message>,
    clients: Arc<Mutex<HashMap<String, Client>>>,
    stats: Arc<Mutex<ServerStats>>,
    emit: EventSink,
    url: String,
) {
    tokio::spawn(async move {
        let Ok(mut ws) = tokio_tungstenite::accept_async(stream).await else {
            if let Ok(mut map) = clients.lock() {
                map.remove(&id);
            }
            emit_status(&emit, &clients, &stats, true, &url, false);
            return;
        };
        loop {
            tokio::select! {
                outgoing = rx.recv() => {
                    match outgoing {
                        Some(message) => {
                            if ws.send(message).await.is_err() {
                                break;
                            }
                        }
                        None => break,
                    }
                }
                incoming = ws.next() => {
                    let Some(Ok(message)) = incoming else { break };
                    match message {
                        Message::Text(text) => {
                            if let Ok(mut map) = clients.lock() {
                                if let Some(client) = map.get_mut(&id) {
                                    client.info.recv_count += 1;
                                }
                            }
                            if let Ok(mut stats) = stats.lock() {
                                stats.total_recv += 1;
                            }
                            emit(serde_json::json!({
                                "type": "log",
                                "level": "info",
                                "message": format!("recv [{id}] {text}"),
                            }));
                        }
                        Message::Close(_) => break,
                        _ => {}
                    }
                }
            }
        }
        if let Ok(mut map) = clients.lock() {
            map.remove(&id);
        }
        emit_status(&emit, &clients, &stats, true, &url, false);
        emit(serde_json::json!({
            "type": "log",
            "level": "info",
            "message": format!("Client disconnected: {id}"),
        }));
    });
}

fn normalize_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        "/".to_string()
    } else if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

fn short_id() -> String {
    uuid::Uuid::new_v4().simple().to_string()[..8].to_string()
}

fn now_text() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::macros::format_description!(
            "[hour]:[minute]:[second]"
        ))
        .unwrap_or_else(|_| "—".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::StreamExt;
    use tokio_tungstenite::connect_async;

    #[tokio::test]
    async fn accepts_clients_broadcasts_and_stops() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        let emit: EventSink = Arc::new(move |payload| {
            if let Ok(mut values) = sink.lock() {
                values.push(payload);
            }
        });
        let manager = WsServerManager::new(emit);

        let probe = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = probe.local_addr().unwrap().port();
        drop(probe);

        let status = manager
            .start("127.0.0.1", port, "/ws", false)
            .await
            .unwrap();
        assert!(status.running);
        let url = status.url.clone();

        let (mut socket, _) = connect_async(url).await.unwrap();
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert_eq!(manager.status().clients.len(), 1);

        manager.send(None, "hello").unwrap();
        let message = tokio::time::timeout(Duration::from_secs(2), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        assert_eq!(message.into_text().unwrap(), "hello");

        manager.stop();
        assert!(!manager.status().running);
    }

    #[tokio::test]
    async fn rejects_tls_until_native_tls_is_wired() {
        let manager = WsServerManager::new(Arc::new(|_| {}));
        let error = manager
            .start("127.0.0.1", 9000, "/ws", true)
            .await
            .unwrap_err();
        assert_eq!(error.code(), "unsupported");
    }
}
