//! Route tracing for the built-in Tracert tool.
//!
//! A real traceroute needs raw ICMP sockets (root on macOS/Linux) or per-hop
//! error queues. Rather than requiring elevation, the host runs the operating
//! system's traceroute (`traceroute` / `tracert`) with a validated, single
//! hostname argument — no shell, no option injection, bounded hops and time.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use devdeck_contract::DevDeckError;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const MAX_HOPS_LIMIT: u32 = 30;
const MAX_OUTPUT_BYTES: usize = 256 * 1024;
const TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceReport {
    pub host: String,
    pub command: String,
    pub output: String,
    pub exit_code: Option<i32>,
    pub truncated: bool,
}

fn validate_host(host: &str) -> Result<&str, DevDeckError> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err(DevDeckError::InvalidArgument(
            "host is required".to_string(),
        ));
    }
    if trimmed.len() > 253
        || trimmed.starts_with('-')
        || trimmed.contains("://")
        || trimmed.contains('/')
        || trimmed.contains(' ')
        || trimmed.contains(';')
        || trimmed.contains('&')
        || trimmed.contains('|')
        || trimmed.contains('`')
        || trimmed.contains('$')
        || trimmed.contains('\n')
    {
        return Err(DevDeckError::InvalidArgument(
            "host must be a bare hostname or IP address".to_string(),
        ));
    }
    Ok(trimmed)
}

fn validate_max_hops(max_hops: u32) -> Result<(), DevDeckError> {
    if max_hops == 0 || max_hops > MAX_HOPS_LIMIT {
        return Err(DevDeckError::InvalidArgument(format!(
            "max hops must be between 1 and {MAX_HOPS_LIMIT}"
        )));
    }
    Ok(())
}

fn trace_command() -> (&'static str, Vec<&'static str>) {
    if cfg!(windows) {
        ("tracert", vec!["-h", "-w"])
    } else {
        ("traceroute", vec!["-m", "-w", "-q"])
    }
}

/// Trace the route to `host`.
pub async fn traceroute(
    app: AppHandle,
    host: &str,
    max_hops: u32,
) -> Result<TraceReport, DevDeckError> {
    let host = validate_host(host)?;
    validate_max_hops(max_hops)?;

    let (program, _) = trace_command();
    let mut command = Command::new(program);
    command.kill_on_drop(true);

    if cfg!(windows) {
        command
            .arg("-h")
            .arg(max_hops.to_string())
            .arg("-w")
            .arg("2000")
            .arg(host);
    } else {
        command
            .arg("-m")
            .arg(max_hops.to_string())
            .arg("-w")
            .arg("2")
            .arg("-q")
            .arg("1")
            .arg(host);
    }

    let rendered = format!(
        "{} {}",
        program,
        command
            .as_std()
            .get_args()
            .map(|arg| arg.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join(" ")
    );

    let mut child = command
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|err| {
            DevDeckError::Internal(format!(
                "could not run '{program}': {err}. Install traceroute or use a supported OS."
            ))
        })?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let collected = Arc::new(Mutex::new(String::new()));
    let emit_lines = |stream: Option<tokio::process::ChildStdout>,
                      app: AppHandle,
                      buffer: Arc<Mutex<String>>| {
        tokio::spawn(async move {
            let Some(stream) = stream else { return };
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut output) = buffer.lock() {
                    output.push_str(&line);
                    output.push('\n');
                }
                let _ = app.emit("tool-traceroute", serde_json::json!({ "line": line }));
            }
        })
    };
    emit_lines(stdout, app.clone(), collected.clone());
    if let Some(stream) = stderr {
        let error_buffer = Arc::new(Mutex::new(String::new()));
        tokio::spawn(async move {
            let mut lines = BufReader::new(stream).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut output) = error_buffer.lock() {
                    output.push_str(&line);
                    output.push('\n');
                }
                let _ = app.emit("tool-traceroute", serde_json::json!({ "line": line }));
            }
        });
    }

    let status = match tokio::time::timeout(TIMEOUT, child.wait()).await {
        Ok(Ok(status)) => status,
        Ok(Err(err)) => {
            return Err(DevDeckError::Internal(format!(
                "traceroute process failed: {err}"
            )))
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err(DevDeckError::Internal(format!(
                "traceroute to '{host}' timed out after 60s"
            )));
        }
    };

    let combined = collected
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    let truncated = combined.len() > MAX_OUTPUT_BYTES;
    let output = if truncated {
        format!("{}… output truncated", &combined[..MAX_OUTPUT_BYTES])
    } else {
        combined
    };

    Ok(TraceReport {
        host: host.to_string(),
        command: rendered,
        output,
        exit_code: status.code(),
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_hosts() {
        for host in ["example.com", "192.168.1.1", "2001:db8::1", "router.local"] {
            assert!(validate_host(host).is_ok(), "{host}");
        }
        for host in [
            "",
            "-oops",
            "http://example.com",
            "example.com/path",
            "a b",
            "x;rm -rf /",
            "$(whoami)",
            "a|b",
        ] {
            assert!(validate_host(host).is_err(), "{host}");
        }
    }

    #[tokio::test]
    async fn rejects_out_of_range_hops() {
        assert!(validate_max_hops(0).is_err());
        assert!(validate_max_hops(31).is_err());
    }

    #[test]
    fn picks_a_platform_command() {
        let (program, _) = trace_command();
        if cfg!(windows) {
            assert_eq!(program, "tracert");
        } else {
            assert_eq!(program, "traceroute");
        }
    }
}
