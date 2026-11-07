//! Route tracing for the built-in Tracert tool.
//!
//! A real traceroute needs raw ICMP sockets (root on macOS/Linux) or per-hop
//! error queues. Rather than requiring elevation, the host runs the operating
//! system's traceroute (`traceroute` / `tracert`) with a validated, single
//! hostname argument — no shell, no option injection, bounded hops and time.

use std::time::Duration;

use devtoolbox_contract::DevToolboxError;
use serde::Serialize;
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

fn validate_host(host: &str) -> Result<&str, DevToolboxError> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err(DevToolboxError::InvalidArgument(
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
        return Err(DevToolboxError::InvalidArgument(
            "host must be a bare hostname or IP address".to_string(),
        ));
    }
    Ok(trimmed)
}

fn trace_command() -> (&'static str, Vec<&'static str>) {
    if cfg!(windows) {
        ("tracert", vec!["-h", "-w"])
    } else {
        ("traceroute", vec!["-m", "-w", "-q"])
    }
}

/// Trace the route to `host`.
pub async fn traceroute(host: &str, max_hops: u32) -> Result<TraceReport, DevToolboxError> {
    let host = validate_host(host)?;
    if max_hops == 0 || max_hops > MAX_HOPS_LIMIT {
        return Err(DevToolboxError::InvalidArgument(format!(
            "max hops must be between 1 and {MAX_HOPS_LIMIT}"
        )));
    }

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

    let output = tokio::time::timeout(TIMEOUT, command.output())
        .await
        .map_err(|_| {
            DevToolboxError::Internal(format!("traceroute to '{host}' timed out after 60s"))
        })?
        .map_err(|err| {
            DevToolboxError::Internal(format!(
                "could not run '{program}': {err}. Install traceroute or use a supported OS."
            ))
        })?;

    let mut combined = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr);
    if !stderr.trim().is_empty() {
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(&stderr);
    }

    let truncated = combined.len() > MAX_OUTPUT_BYTES;
    if truncated {
        combined.truncate(MAX_OUTPUT_BYTES);
        combined.push_str("\n… output truncated");
    }

    Ok(TraceReport {
        host: host.to_string(),
        command: rendered,
        output: combined,
        exit_code: output.status.code(),
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
        assert!(traceroute("example.com", 0).await.is_err());
        assert!(traceroute("example.com", 31).await.is_err());
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
