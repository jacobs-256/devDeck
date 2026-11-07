//! Plugin diagnostic logging (`log:write`).
//!
//! Plugin logs are appended as NDJSON to `<data>/logs/plugins.log` and rotated
//! at 5 MiB so a noisy plugin cannot fill the user's disk.

use std::io::Write;
use std::path::Path;

use devtoolbox_contract::{DevToolboxError, PluginId};
use serde_json::{json, Value};

use crate::state::now_ms;

const MAX_MESSAGE_BYTES: usize = 8 * 1024;
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

pub fn write_plugin_log(
    root: &Path,
    plugin_id: &PluginId,
    level: &str,
    message: &str,
    data: Option<&Value>,
) -> Result<(), DevToolboxError> {
    let level = match level {
        "debug" | "info" | "warn" | "error" => level,
        _ => "info",
    };
    let message = truncate_utf8(message, MAX_MESSAGE_BYTES);

    let dir = root.join("logs");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("plugins.log");
    rotate_if_needed(&path)?;

    let entry = json!({
        "ts": now_ms(),
        "plugin": plugin_id.as_str(),
        "level": level,
        "message": message,
        "data": data,
    });

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    writeln!(file, "{}", serde_json::to_string(&entry)?)?;
    Ok(())
}

fn rotate_if_needed(path: &Path) -> Result<(), DevToolboxError> {
    let Ok(metadata) = std::fs::metadata(path) else {
        return Ok(());
    };
    if metadata.len() < MAX_LOG_BYTES {
        return Ok(());
    }
    let rotated = path.with_extension("log.1");
    if rotated.exists() {
        std::fs::remove_file(&rotated)?;
    }
    std::fs::rename(path, rotated)?;
    Ok(())
}

fn truncate_utf8(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &value[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_ndjson_lines() {
        let dir = tempfile::tempdir().unwrap();
        let id = PluginId::new("market-demo").unwrap();
        write_plugin_log(dir.path(), &id, "info", "hello", Some(&json!({ "n": 1 }))).unwrap();
        write_plugin_log(dir.path(), &id, "bogus-level", "second", None).unwrap();

        let contents = std::fs::read_to_string(dir.path().join("logs/plugins.log")).unwrap();
        let lines: Vec<&str> = contents.lines().collect();
        assert_eq!(lines.len(), 2);

        let first: Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first["plugin"], "market-demo");
        assert_eq!(first["level"], "info");
        assert_eq!(first["data"]["n"], 1);

        let second: Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(second["level"], "info", "unknown levels fall back to info");
    }

    #[test]
    fn truncates_long_messages_on_char_boundaries() {
        let dir = tempfile::tempdir().unwrap();
        let id = PluginId::new("market-demo").unwrap();
        let message = "é".repeat(MAX_MESSAGE_BYTES);
        write_plugin_log(dir.path(), &id, "error", &message, None).unwrap();
        let contents = std::fs::read_to_string(dir.path().join("logs/plugins.log")).unwrap();
        assert!(contents.len() < MAX_MESSAGE_BYTES + 256);
    }
}
