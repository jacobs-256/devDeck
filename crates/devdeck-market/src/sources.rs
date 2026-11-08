//! User-configured Marketplace registry sources.
//!
//! A source is a URL to a schema-2 `registry.json` plus the trust policy for
//! that registry. Sources are persisted separately from installed plugins so a
//! broken registry can be removed without touching installs.

use std::path::{Path, PathBuf};

use devdeck_contract::{is_valid_slug, DevDeckError};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::signing::KeyId;

const SOURCES_FILE: &str = "marketplace-sources.json";
const SOURCES_SCHEMA_VERSION: u32 = 1;

/// One user-configured registry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySource {
    /// Stable slug derived from the host; used as the cache key.
    pub id: String,
    pub name: String,
    /// Absolute URL of `registry.json`.
    pub url: String,
    /// Base64 Ed25519 public key used to verify the registry document.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub public_key: Option<String>,
    /// Reject the registry when no valid signature is present.
    #[serde(default)]
    pub require_signature: bool,
    #[serde(default)]
    pub added_at_ms: u64,
}

impl RegistrySource {
    /// Validate and normalize a registry URL.
    pub fn validate_url(raw: &str) -> Result<Url, DevDeckError> {
        let trimmed = raw.trim();
        let url = Url::parse(trimmed)
            .map_err(|err| DevDeckError::InvalidArgument(format!("invalid registry URL: {err}")))?;
        match url.scheme() {
            "https" => {}
            "http" if is_loopback(&url) => {}
            "file" if cfg!(debug_assertions) => {
                let path = url.to_file_path().map_err(|_| {
                    DevDeckError::InvalidArgument(
                        "file registry URLs must be absolute local paths".to_string(),
                    )
                })?;
                if !path
                    .extension()
                    .and_then(std::ffi::OsStr::to_str)
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
                {
                    return Err(DevDeckError::InvalidArgument(
                        "file registry URLs must point to a .json file".to_string(),
                    ));
                }
            }
            "file" => {
                return Err(DevDeckError::denied(
                    "file registries are only available in development builds".to_string(),
                ))
            }
            other => {
                return Err(DevDeckError::InvalidArgument(format!(
                "registry URL must use https (http is only allowed for localhost), got '{other}'"
            )))
            }
        }
        if !url.username().is_empty() || url.password().is_some() {
            return Err(DevDeckError::InvalidArgument(
                "registry URLs must not embed credentials".to_string(),
            ));
        }
        if url.scheme() != "file" && url.host_str().is_none() {
            return Err(DevDeckError::InvalidArgument(
                "registry URL must include a host".to_string(),
            ));
        }
        Ok(url)
    }

    /// Key id of the configured public key, if any.
    pub fn key_id(&self) -> Result<Option<KeyId>, DevDeckError> {
        match &self.public_key {
            Some(key) => Ok(Some(KeyId::from_public_key_base64(key)?)),
            None => Ok(None),
        }
    }
}

fn is_loopback(url: &Url) -> bool {
    matches!(
        url.host_str(),
        Some("localhost") | Some("127.0.0.1") | Some("[::1]") | Some("::1")
    )
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourcesFile {
    #[serde(default = "default_schema")]
    schema_version: u32,
    #[serde(default)]
    sources: Vec<RegistrySource>,
}

fn default_schema() -> u32 {
    SOURCES_SCHEMA_VERSION
}

/// Persisted list of registry sources.
#[derive(Debug)]
pub struct SourceStore {
    path: PathBuf,
    sources: Vec<RegistrySource>,
}

impl SourceStore {
    pub fn open(root: &Path) -> Result<Self, DevDeckError> {
        std::fs::create_dir_all(root)?;
        let path = root.join(SOURCES_FILE);
        let sources = match std::fs::read(&path) {
            Ok(bytes) => {
                let file: SourcesFile = serde_json::from_slice(&bytes).map_err(|err| {
                    DevDeckError::InvalidArgument(format!(
                        "marketplace sources file is unreadable: {err}"
                    ))
                })?;
                if file.schema_version > SOURCES_SCHEMA_VERSION {
                    return Err(DevDeckError::Unsupported(format!(
                        "marketplace sources schema {} is newer than this build supports",
                        file.schema_version
                    )));
                }
                file.sources
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(err) => return Err(err.into()),
        };
        Ok(Self { path, sources })
    }

    pub fn list(&self) -> Vec<RegistrySource> {
        let mut sources = self.sources.clone();
        sources.sort_by_key(|source| source.added_at_ms);
        sources
    }

    pub fn get(&self, id: &str) -> Option<RegistrySource> {
        self.sources.iter().find(|source| source.id == id).cloned()
    }

    /// Add a source. Re-adding the same URL updates the name/trust policy.
    pub fn add(
        &mut self,
        name: Option<&str>,
        url: &str,
        public_key: Option<&str>,
        require_signature: bool,
        now_ms: u64,
    ) -> Result<RegistrySource, DevDeckError> {
        let parsed = RegistrySource::validate_url(url)?;
        let normalized = parsed.to_string();

        if let Some(public_key) = public_key {
            KeyId::from_public_key_base64(public_key)?;
        }
        if require_signature && public_key.is_none() {
            return Err(DevDeckError::InvalidArgument(
                "requireSignature needs a publicKey".to_string(),
            ));
        }

        let host = if parsed.scheme() == "file" {
            parsed
                .to_file_path()
                .ok()
                .and_then(|path| {
                    path.file_stem()
                        .map(|stem| stem.to_string_lossy().into_owned())
                })
                .map(|stem| sanitize_slug(&stem))
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "local-registry".to_string())
        } else {
            parsed
                .host_str()
                .map(sanitize_slug)
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| "registry".to_string())
        };
        let display_name = name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| host.clone());

        if let Some(existing) = self
            .sources
            .iter_mut()
            .find(|source| source.url == normalized)
        {
            existing.name = display_name;
            existing.public_key = public_key.map(str::to_string);
            existing.require_signature = require_signature;
            let updated = existing.clone();
            self.save()?;
            return Ok(updated);
        }

        let mut id = host.clone();
        let mut suffix = 2u32;
        while self.sources.iter().any(|source| source.id == id) {
            id = format!("{host}-{suffix}");
            suffix += 1;
        }
        // Slugs are capped at 64 characters; trim any overflow from the suffix.
        if id.len() > 64 {
            id = id[..64].trim_end_matches('-').to_string();
        }
        if !is_valid_slug(&id) {
            return Err(DevDeckError::InvalidArgument(format!(
                "could not derive a valid source id from '{normalized}'"
            )));
        }

        let source = RegistrySource {
            id,
            name: display_name,
            url: normalized,
            public_key: public_key.map(str::to_string),
            require_signature,
            added_at_ms: now_ms,
        };
        self.sources.push(source.clone());
        self.save()?;
        Ok(source)
    }

    pub fn remove(&mut self, id: &str) -> Result<(), DevDeckError> {
        let before = self.sources.len();
        self.sources.retain(|source| source.id != id);
        if self.sources.len() == before {
            return Err(DevDeckError::NotFound(format!(
                "registry source '{id}' is not configured"
            )));
        }
        self.save()
    }

    fn save(&self) -> Result<(), DevDeckError> {
        let file = SourcesFile {
            schema_version: SOURCES_SCHEMA_VERSION,
            sources: self.sources.clone(),
        };
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&file)?)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

fn sanitize_slug(value: &str) -> String {
    let mut slug = String::new();
    for character in value.to_ascii_lowercase().chars() {
        if character.is_ascii_alphanumeric() {
            slug.push(character);
        } else if !slug.ends_with('-') {
            slug.push('-');
        }
    }
    let trimmed = slug.trim_matches('-').to_string();
    trimmed
        .chars()
        .take(48)
        .collect::<String>()
        .trim_end_matches('-')
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_and_persists_sources() {
        let dir = tempfile::tempdir().unwrap();
        {
            let mut store = SourceStore::open(dir.path()).unwrap();
            let source = store
                .add(
                    Some("Official"),
                    "https://example.com/marketplace/registry.json",
                    None,
                    false,
                    1,
                )
                .unwrap();
            assert_eq!(source.id, "example-com");
            assert_eq!(source.name, "Official");
        }
        let store = SourceStore::open(dir.path()).unwrap();
        assert_eq!(store.list().len(), 1);
    }

    #[test]
    fn readding_same_url_updates_policy() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SourceStore::open(dir.path()).unwrap();
        store
            .add(None, "https://example.com/registry.json", None, false, 1)
            .unwrap();
        let updated = store
            .add(
                Some("Renamed"),
                "https://example.com/registry.json",
                None,
                false,
                2,
            )
            .unwrap();
        assert_eq!(updated.name, "Renamed");
        assert_eq!(store.list().len(), 1);
    }

    #[test]
    fn ids_are_deduplicated() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SourceStore::open(dir.path()).unwrap();
        store
            .add(None, "https://example.com/a/registry.json", None, false, 1)
            .unwrap();
        let second = store
            .add(None, "https://example.com/b/registry.json", None, false, 2)
            .unwrap();
        assert_eq!(second.id, "example-com-2");
    }

    #[test]
    fn rejects_insecure_and_credentialed_urls() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SourceStore::open(dir.path()).unwrap();
        for url in [
            "http://example.com/registry.json",
            "ftp://example.com/registry.json",
            "https://user:pass@example.com/registry.json",
            "not a url",
        ] {
            assert!(store.add(None, url, None, false, 1).is_err(), "{url}");
        }
        // Localhost over http is allowed for development.
        assert!(store
            .add(None, "http://localhost:8080/registry.json", None, false, 1)
            .is_ok());
    }

    #[test]
    fn accepts_local_file_registries() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("registry.local.json");
        std::fs::write(&path, "{}").unwrap();
        let url = url::Url::from_file_path(&path).unwrap().to_string();
        let mut store = SourceStore::open(dir.path()).unwrap();
        let source = store.add(None, &url, None, false, 1).unwrap();
        assert_eq!(source.url, url);
        assert!(source.id.starts_with("registry-local"));

        let text = url::Url::from_file_path(dir.path().join("notes.txt"))
            .unwrap()
            .to_string();
        assert_eq!(
            store.add(None, &text, None, false, 2).unwrap_err().code(),
            "invalid_argument"
        );
    }

    #[test]
    fn require_signature_needs_a_key() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SourceStore::open(dir.path()).unwrap();
        let err = store
            .add(None, "https://example.com/registry.json", None, true, 1)
            .unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
    }

    #[test]
    fn remove_reports_unknown_sources() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = SourceStore::open(dir.path()).unwrap();
        assert_eq!(store.remove("nope").unwrap_err().code(), "not_found");
    }
}
