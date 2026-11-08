//! Host-mediated file access for plugins (`fs:dialog`, `fs:read`, `fs:write`,
//! `fs:plugin-data`).
//!
//! Plugins never receive filesystem paths. A dialog produces an opaque token
//! bound to (plugin, path, mode); reads and writes only work through tokens the
//! user personally approved in this session. Tokens are revoked when the plugin
//! is disabled or uninstalled.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::Engine;
use devdeck_contract::{ensure_within, resolve_within, DevDeckError, PluginId};
use serde::Serialize;

const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;
const STANDARD: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;

/// A file the user granted through a dialog.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantedFile {
    pub file_token: String,
    pub name: String,
    pub size: u64,
}

/// Contents returned to the plugin.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContents {
    pub content: String,
    pub name: String,
    pub size: u64,
    pub encoding: String,
}

#[derive(Debug)]
struct TokenEntry {
    plugin_id: String,
    path: PathBuf,
    writable: bool,
}

/// Session-scoped token store plus the per-plugin data directory sandbox.
#[derive(Debug)]
pub struct FileAccess {
    data_root: PathBuf,
    tokens: Mutex<HashMap<String, TokenEntry>>,
}

impl FileAccess {
    pub fn new(data_root: impl Into<PathBuf>) -> Result<Self, DevDeckError> {
        let data_root = data_root.into();
        std::fs::create_dir_all(&data_root)?;
        Ok(Self {
            data_root: data_root.canonicalize()?,
            tokens: Mutex::new(HashMap::new()),
        })
    }

    /// Register a user-approved path and return its token.
    pub fn grant(
        &self,
        plugin_id: &PluginId,
        path: &Path,
        writable: bool,
    ) -> Result<GrantedFile, DevDeckError> {
        let size = match std::fs::metadata(path) {
            Ok(metadata) => {
                if !metadata.is_file() {
                    return Err(DevDeckError::InvalidArgument(format!(
                        "'{}' is not a file",
                        path.display()
                    )));
                }
                if metadata.len() > MAX_FILE_BYTES {
                    return Err(DevDeckError::InvalidArgument(
                        "the selected file is larger than 8 MiB".to_string(),
                    ));
                }
                metadata.len()
            }
            Err(err) if writable && err.kind() == std::io::ErrorKind::NotFound => 0,
            Err(err) => return Err(err.into()),
        };

        let file_token = uuid::Uuid::new_v4().to_string();
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("file")
            .to_string();

        self.tokens
            .lock()
            .map_err(|_| DevDeckError::Internal("file token lock poisoned".to_string()))?
            .insert(
                file_token.clone(),
                TokenEntry {
                    plugin_id: plugin_id.to_string(),
                    path: path.to_path_buf(),
                    writable,
                },
            );

        Ok(GrantedFile {
            file_token,
            name,
            size,
        })
    }

    /// Drop every token owned by a plugin (disable / uninstall).
    pub fn revoke_plugin(&self, plugin_id: &PluginId) {
        if let Ok(mut tokens) = self.tokens.lock() {
            tokens.retain(|_, entry| entry.plugin_id != plugin_id.as_str());
        }
    }

    pub fn read_token(
        &self,
        plugin_id: &PluginId,
        file_token: &str,
        encoding: Option<&str>,
    ) -> Result<FileContents, DevDeckError> {
        let path = self.resolve(plugin_id, file_token, false)?;
        read_file(&path, encoding)
    }

    pub fn write_token(
        &self,
        plugin_id: &PluginId,
        file_token: &str,
        content: &str,
        encoding: Option<&str>,
    ) -> Result<u64, DevDeckError> {
        let path = self.resolve(plugin_id, file_token, true)?;
        write_file(&path, content, encoding)
    }

    pub fn read_data(
        &self,
        plugin_id: &PluginId,
        relative: &str,
        encoding: Option<&str>,
    ) -> Result<FileContents, DevDeckError> {
        let base = self.data_dir(plugin_id);
        let target = resolve_within(&base, relative)?;
        let canonical = ensure_within(&base, &target).map_err(|_| {
            DevDeckError::NotFound(format!("'{relative}' does not exist in plugin data"))
        })?;
        read_file(&canonical, encoding)
    }

    pub fn write_data(
        &self,
        plugin_id: &PluginId,
        relative: &str,
        content: &str,
        encoding: Option<&str>,
    ) -> Result<u64, DevDeckError> {
        let base = self.data_dir(plugin_id);
        std::fs::create_dir_all(&base)?;
        let target = resolve_within(&base, relative)?;
        let parent = target
            .parent()
            .ok_or_else(|| DevDeckError::InvalidArgument("path must name a file".to_string()))?;
        std::fs::create_dir_all(parent)?;
        ensure_within(&base, parent)?;
        write_file(&target, content, encoding)
    }

    fn data_dir(&self, plugin_id: &PluginId) -> PathBuf {
        self.data_root.join(plugin_id.as_str())
    }

    fn resolve(
        &self,
        plugin_id: &PluginId,
        file_token: &str,
        write: bool,
    ) -> Result<PathBuf, DevDeckError> {
        let tokens = self
            .tokens
            .lock()
            .map_err(|_| DevDeckError::Internal("file token lock poisoned".to_string()))?;
        let entry = tokens
            .get(file_token)
            .ok_or_else(|| DevDeckError::NotFound("unknown file token".to_string()))?;
        if entry.plugin_id != plugin_id.as_str() {
            return Err(DevDeckError::denied(
                "file token belongs to a different plugin",
            ));
        }
        if write && !entry.writable {
            return Err(DevDeckError::denied(
                "the user selected this file for reading only",
            ));
        }
        Ok(entry.path.clone())
    }
}

fn read_file(path: &Path, encoding: Option<&str>) -> Result<FileContents, DevDeckError> {
    let metadata = std::fs::metadata(path)?;
    if metadata.len() > MAX_FILE_BYTES {
        return Err(DevDeckError::InvalidArgument(
            "file is larger than the 8 MiB limit".to_string(),
        ));
    }
    let bytes = std::fs::read(path)?;
    let (content, encoding) = encode_bytes(&bytes, encoding)?;
    Ok(FileContents {
        content,
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("file")
            .to_string(),
        size: bytes.len() as u64,
        encoding,
    })
}

fn write_file(path: &Path, content: &str, encoding: Option<&str>) -> Result<u64, DevDeckError> {
    let bytes = decode_content(content, encoding)?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(DevDeckError::InvalidArgument(
            "content is larger than the 8 MiB write limit".to_string(),
        ));
    }
    std::fs::write(path, &bytes)?;
    Ok(bytes.len() as u64)
}

fn normalize_encoding(encoding: Option<&str>) -> &str {
    match encoding.unwrap_or("utf8") {
        "utf-8" | "utf8" | "text" => "utf8",
        "base64" => "base64",
        other => other,
    }
}

fn encode_bytes(bytes: &[u8], encoding: Option<&str>) -> Result<(String, String), DevDeckError> {
    match normalize_encoding(encoding) {
        "utf8" => String::from_utf8(bytes.to_vec())
            .map(|text| (text, "utf8".to_string()))
            .map_err(|_| {
                DevDeckError::InvalidArgument(
                    "file is not valid UTF-8; read it with base64 encoding".to_string(),
                )
            }),
        "base64" => Ok((STANDARD.encode(bytes), "base64".to_string())),
        other => Err(DevDeckError::InvalidArgument(format!(
            "unknown encoding '{other}' (use 'utf8' or 'base64')"
        ))),
    }
}

fn decode_content(content: &str, encoding: Option<&str>) -> Result<Vec<u8>, DevDeckError> {
    match normalize_encoding(encoding) {
        "utf8" => Ok(content.as_bytes().to_vec()),
        "base64" => STANDARD
            .decode(content.trim())
            .map_err(|err| DevDeckError::InvalidArgument(format!("invalid Base64 content: {err}"))),
        other => Err(DevDeckError::InvalidArgument(format!(
            "unknown encoding '{other}' (use 'utf8' or 'base64')"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plugin() -> PluginId {
        PluginId::new("market-files").unwrap()
    }

    #[test]
    fn granted_tokens_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let access = FileAccess::new(dir.path().join("data")).unwrap();
        let path = dir.path().join("notes.txt");
        std::fs::write(&path, "hello").unwrap();

        let granted = access.grant(&plugin(), &path, false).unwrap();
        assert_eq!(granted.name, "notes.txt");

        let contents = access
            .read_token(&plugin(), &granted.file_token, None)
            .unwrap();
        assert_eq!(contents.content, "hello");
        assert_eq!(contents.encoding, "utf8");

        let denied = access
            .write_token(&plugin(), &granted.file_token, "nope", None)
            .unwrap_err();
        assert_eq!(denied.code(), "permission_denied");
    }

    #[test]
    fn save_tokens_are_writable() {
        let dir = tempfile::tempdir().unwrap();
        let access = FileAccess::new(dir.path().join("data")).unwrap();
        let path = dir.path().join("out.bin");
        let granted = access.grant(&plugin(), &path, true).unwrap();
        assert_eq!(granted.size, 0);

        access
            .write_token(&plugin(), &granted.file_token, "aGk=", Some("base64"))
            .unwrap();
        let contents = access
            .read_token(&plugin(), &granted.file_token, Some("base64"))
            .unwrap();
        assert_eq!(contents.content, "aGk=");
        assert_eq!(std::fs::read(&path).unwrap(), b"hi");
    }

    #[test]
    fn tokens_are_plugin_scoped() {
        let dir = tempfile::tempdir().unwrap();
        let access = FileAccess::new(dir.path().join("data")).unwrap();
        let path = dir.path().join("x.txt");
        std::fs::write(&path, "x").unwrap();
        let granted = access.grant(&plugin(), &path, false).unwrap();

        let other = PluginId::new("market-other").unwrap();
        let error = access
            .read_token(&other, &granted.file_token, None)
            .unwrap_err();
        assert_eq!(error.code(), "permission_denied");
        assert_eq!(
            access
                .read_token(&plugin(), "missing", None)
                .unwrap_err()
                .code(),
            "not_found"
        );
    }

    #[test]
    fn revoke_plugin_drops_tokens() {
        let dir = tempfile::tempdir().unwrap();
        let access = FileAccess::new(dir.path().join("data")).unwrap();
        let path = dir.path().join("x.txt");
        std::fs::write(&path, "x").unwrap();
        let granted = access.grant(&plugin(), &path, false).unwrap();
        access.revoke_plugin(&plugin());
        assert_eq!(
            access
                .read_token(&plugin(), &granted.file_token, None)
                .unwrap_err()
                .code(),
            "not_found"
        );
    }

    #[test]
    fn plugin_data_round_trip_and_traversal_guard() {
        let dir = tempfile::tempdir().unwrap();
        let access = FileAccess::new(dir.path().join("data")).unwrap();

        access
            .write_data(&plugin(), "nested/config.json", "{\"a\":1}", None)
            .unwrap();
        let contents = access
            .read_data(&plugin(), "nested/config.json", None)
            .unwrap();
        assert_eq!(contents.content, "{\"a\":1}");

        assert!(access.read_data(&plugin(), "../escape.txt", None).is_err());
        assert!(access
            .write_data(&plugin(), "../escape.txt", "nope", None)
            .is_err());
    }

    #[test]
    fn encoding_errors_are_reported() {
        let dir = tempfile::tempdir().unwrap();
        let access = FileAccess::new(dir.path().join("data")).unwrap();
        // 0xFF 0xFE is not valid UTF-8 but is valid Base64 content.
        access
            .write_data(&plugin(), "bin.dat", "//4=", Some("base64"))
            .unwrap();

        let error = access.read_data(&plugin(), "bin.dat", None).unwrap_err();
        assert_eq!(error.code(), "invalid_argument");
        assert_eq!(
            access
                .read_data(&plugin(), "bin.dat", Some("base64"))
                .unwrap()
                .content,
            "//4="
        );
        assert!(access
            .write_data(&plugin(), "x.txt", "%%%", Some("base64"))
            .is_err());
    }
}
