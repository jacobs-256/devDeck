//! TCP reachability probe used by the built-in Ping tool.
//!
//! ICMP echo requires raw sockets (root on macOS/Linux). Instead this measures a
//! TCP handshake to a chosen port, which works unprivileged and is what most
//! "is the service reachable" checks actually care about.

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use devdeck_contract::DevDeckError;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncRead, BufReader};
use tokio::net::TcpStream;

const MAX_SAMPLES: u32 = 20;
const MAX_TIMEOUT_MS: u64 = 10_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingSample {
    pub seq: u32,
    /// Round-trip time in milliseconds when the connection succeeded.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingReport {
    pub host: String,
    pub port: u16,
    pub resolved: String,
    pub samples: Vec<PingSample>,
    pub sent: u32,
    pub received: u32,
    pub min_ms: Option<f64>,
    pub max_ms: Option<f64>,
    pub avg_ms: Option<f64>,
}

/// Result of the OS `ping` binary, used by the restored legacy Ping tool.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePingReport {
    pub host: String,
    pub output: String,
    pub exit_code: Option<i32>,
}

/// Run the platform `ping` command (ICMP) for legacy tool compatibility.
pub async fn system_ping(
    app: AppHandle,
    host: &str,
    count: u32,
) -> Result<NativePingReport, DevDeckError> {
    let host = validate_host(host)?;
    let count = count.clamp(1, 20);

    let mut command = tokio::process::Command::new("ping");
    if cfg!(windows) {
        command.args(["-n", &count.to_string()]);
    } else {
        command.args(["-c", &count.to_string()]);
    }
    let mut child = command
        .arg(host)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|err| DevDeckError::Internal(format!("failed to run ping: {err}")))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let collected = Arc::new(Mutex::new(String::new()));

    stream_lines(stdout, app.clone(), collected.clone());
    stream_lines(stderr, app.clone(), collected.clone());

    let status = match tokio::time::timeout(Duration::from_secs(60), child.wait()).await {
        Ok(Ok(status)) => status,
        Ok(Err(err)) => {
            return Err(DevDeckError::Internal(format!(
                "ping process failed: {err}"
            )))
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err(DevDeckError::Internal(format!(
                "ping to '{host}' timed out after 60s"
            )));
        }
    };

    Ok(NativePingReport {
        host: host.to_string(),
        output: collected
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default(),
        exit_code: status.code(),
    })
}

fn stream_lines<R>(stream: Option<R>, app: AppHandle, buffer: Arc<Mutex<String>>)
where
    R: AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let Some(stream) = stream else { return };
        let mut lines = BufReader::new(stream).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if let Ok(mut output) = buffer.lock() {
                output.push_str(&line);
                output.push('\n');
            }
            let _ = app.emit("tool-ping", serde_json::json!({ "line": line }));
        }
    });
}

fn validate_host(host: &str) -> Result<&str, DevDeckError> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err(DevDeckError::InvalidArgument(
            "host is required".to_string(),
        ));
    }
    if trimmed.len() > 253
        || trimmed.contains("://")
        || trimmed.contains('/')
        || trimmed.contains(' ')
        || trimmed.contains(';')
    {
        return Err(DevDeckError::InvalidArgument(
            "host must be a bare hostname or IP address".to_string(),
        ));
    }
    Ok(trimmed)
}

async fn resolve(host: &str, port: u16) -> Result<SocketAddr, DevDeckError> {
    tokio::net::lookup_host((host, port))
        .await
        .map_err(|err| DevDeckError::InvalidArgument(format!("cannot resolve '{host}': {err}")))?
        .next()
        .ok_or_else(|| {
            DevDeckError::InvalidArgument(format!("'{host}' did not resolve to an address"))
        })
}

/// Probe `host:port` `count` times.
pub async fn tcp_ping(
    host: &str,
    port: u16,
    count: u32,
    timeout_ms: u64,
) -> Result<PingReport, DevDeckError> {
    let host = validate_host(host)?;
    if count == 0 || count > MAX_SAMPLES {
        return Err(DevDeckError::InvalidArgument(format!(
            "count must be between 1 and {MAX_SAMPLES}"
        )));
    }
    if timeout_ms == 0 || timeout_ms > MAX_TIMEOUT_MS {
        return Err(DevDeckError::InvalidArgument(format!(
            "timeout must be between 1 and {MAX_TIMEOUT_MS} ms"
        )));
    }

    let address = resolve(host, port).await?;
    let timeout = Duration::from_millis(timeout_ms);
    let mut samples = Vec::with_capacity(count as usize);

    for seq in 1..=count {
        let started = Instant::now();
        match tokio::time::timeout(timeout, TcpStream::connect(address)).await {
            Ok(Ok(stream)) => {
                drop(stream);
                samples.push(PingSample {
                    seq,
                    latency_ms: Some(started.elapsed().as_secs_f64() * 1000.0),
                    error: None,
                });
            }
            Ok(Err(err)) => samples.push(PingSample {
                seq,
                latency_ms: None,
                error: Some(err.to_string()),
            }),
            Err(_) => samples.push(PingSample {
                seq,
                latency_ms: None,
                error: Some(format!("timed out after {timeout_ms} ms")),
            }),
        }
        if seq < count {
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
    }

    let latencies: Vec<f64> = samples
        .iter()
        .filter_map(|sample| sample.latency_ms)
        .collect();
    let min_ms = latencies.iter().copied().reduce(f64::min);
    let max_ms = latencies.iter().copied().reduce(f64::max);
    let avg_ms = if latencies.is_empty() {
        None
    } else {
        Some(latencies.iter().sum::<f64>() / latencies.len() as f64)
    };

    Ok(PingReport {
        host: host.to_string(),
        port,
        resolved: address.to_string(),
        sent: count,
        received: latencies.len() as u32,
        min_ms,
        max_ms,
        avg_ms,
        samples,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn probes_an_open_port() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            loop {
                if listener.accept().await.is_err() {
                    break;
                }
            }
        });

        let report = tcp_ping("127.0.0.1", port, 2, 1000).await.unwrap();
        assert_eq!(report.sent, 2);
        assert_eq!(report.received, 2);
        assert!(report.min_ms.is_some());
        assert!(report.avg_ms.unwrap() >= 0.0);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn reports_closed_ports_and_timeouts() {
        // Bind then drop to get a very likely closed port.
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let report = tcp_ping("127.0.0.1", port, 1, 200).await.unwrap();
        assert_eq!(report.sent, 1);
        assert!(report.received <= 1);
        if report.received == 0 {
            assert!(report.samples[0].error.is_some());
        }
    }

    #[tokio::test]
    async fn validates_inputs() {
        assert!(tcp_ping("", 80, 1, 100).await.is_err());
        assert!(tcp_ping("http://example.com", 80, 1, 100).await.is_err());
        assert!(tcp_ping("example.com", 80, 0, 100).await.is_err());
        assert!(tcp_ping("example.com", 80, 100, 100).await.is_err());
        assert!(tcp_ping("example.com", 80, 1, 0).await.is_err());
        assert!(tcp_ping("example.com", 80, 1, 60_000).await.is_err());
    }
}
