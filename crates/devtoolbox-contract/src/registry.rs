//! Marketplace registry documents.
//!
//! A registry is a static `registry.json` served over HTTPS (or bundled with
//! the app). Anybody can host one, which keeps the Marketplace decentralized:
//! the official registry is just the default entry in the user's source list.

use serde::{Deserialize, Serialize};

use crate::error::{DevToolboxError, ValidationIssue};
use crate::ids::PluginId;
use crate::manifest::{PluginManifest, CURRENT_SCHEMA_VERSION};

fn default_schema_version() -> u32 {
    CURRENT_SCHEMA_VERSION
}

/// Lifecycle state of a published release.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryStatus {
    #[default]
    Active,
    /// Still installable, but the author recommends migrating away.
    Deprecated,
    /// Not installable; kept for auditability.
    Yanked,
    /// Unknown future status: treat as unavailable.
    #[serde(other)]
    Unknown,
}

/// Detached signature over the registry document.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignatureEnvelope {
    /// Short key identifier (first 16 hex chars of sha256(pubkey)).
    pub key_id: String,
    /// Base64 (standard, padded) Ed25519 signature over the exact bytes of
    /// `registry.json` (excluding any sibling `.sig` file).
    pub signature: String,
}

/// One published plugin release.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryEntry {
    pub manifest: PluginManifest,
    /// Absolute HTTPS URL of the `.zip` package.
    pub download_url: String,
    /// Lowercase hex SHA-256 of the `.zip` package.
    pub sha256: String,
    /// Package size in bytes (used for progress + sanity checks).
    #[serde(default)]
    pub size: u64,
    /// RFC 3339 timestamp.
    #[serde(default)]
    pub published_at: String,
    #[serde(default)]
    pub status: EntryStatus,
    /// Optional detached signature over the package bytes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<SignatureEnvelope>,
}

/// A `registry.json` document.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryIndex {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub plugins: Vec<RegistryEntry>,
}

impl RegistryIndex {
    /// Parse and validate a registry document.
    pub fn parse(bytes: &[u8]) -> Result<Self, DevToolboxError> {
        let index: Self = serde_json::from_slice(bytes).map_err(|err| {
            DevToolboxError::InvalidManifest(format!("malformed registry.json: {err}"))
        })?;
        index.validate_strict()?;
        Ok(index)
    }

    /// Structural validation of every entry.
    pub fn validate(&self) -> Vec<ValidationIssue> {
        let mut issues = Vec::new();

        if self.schema_version == 0 || self.schema_version > CURRENT_SCHEMA_VERSION {
            issues.push(ValidationIssue::error(
                "schemaVersion",
                "unsupported_schema",
                format!(
                    "registry schemaVersion {} is not supported (expected 1..={CURRENT_SCHEMA_VERSION})",
                    self.schema_version
                ),
            ));
        }

        let mut seen: std::collections::BTreeSet<(String, String)> =
            std::collections::BTreeSet::new();
        for (index, entry) in self.plugins.iter().enumerate() {
            let prefix = format!("plugins[{index}]");
            for issue in entry.manifest.validate() {
                if issue.is_error() {
                    issues.push(ValidationIssue::error(
                        format!("{prefix}.manifest.{}", issue.field),
                        issue.code,
                        issue.message,
                    ));
                }
            }
            if !is_sha256_hex(&entry.sha256) {
                issues.push(ValidationIssue::error(
                    format!("{prefix}.sha256"),
                    "invalid_sha256",
                    "sha256 must be 64 lowercase hex characters",
                ));
            }
            if !is_acceptable_download_url(&entry.download_url) {
                issues.push(ValidationIssue::error(
                    format!("{prefix}.downloadUrl"),
                    "invalid_download_url",
                    "downloadUrl must be an absolute https:// URL (http://localhost is allowed for development)",
                ));
            }
            let key = (
                entry.manifest.id.to_string(),
                entry.manifest.version.clone(),
            );
            if !seen.insert(key.clone()) {
                issues.push(ValidationIssue::error(
                    prefix.to_string(),
                    "duplicate_release",
                    format!("duplicate release {}@{}", key.0, key.1),
                ));
            }
        }

        issues
    }

    pub fn validate_strict(&self) -> Result<(), DevToolboxError> {
        let issues = self.validate();
        let errors: Vec<&ValidationIssue> = issues.iter().filter(|i| i.is_error()).collect();
        if errors.is_empty() {
            return Ok(());
        }
        let summary = errors
            .iter()
            .map(|i| format!("{}: {}", i.field, i.message))
            .collect::<Vec<_>>()
            .join("; ");
        Err(DevToolboxError::InvalidManifest(summary))
    }

    /// Newest installable release for a plugin id.
    pub fn latest(&self, id: &PluginId) -> Option<&RegistryEntry> {
        self.plugins
            .iter()
            .filter(|entry| &entry.manifest.id == id && entry.status == EntryStatus::Active)
            .max_by_key(|entry| semver::Version::parse(&entry.manifest.version).ok())
    }

    pub fn find(&self, id: &PluginId, version: &str) -> Option<&RegistryEntry> {
        self.plugins
            .iter()
            .find(|entry| &entry.manifest.id == id && entry.manifest.version == version)
    }
}

/// `true` for a lowercase 64-character hex digest.
pub fn is_sha256_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

fn is_acceptable_download_url(value: &str) -> bool {
    match url::Url::parse(value) {
        Ok(parsed) => match parsed.scheme() {
            "https" => parsed.host_str().is_some(),
            "http" => matches!(
                parsed.host_str(),
                Some("localhost") | Some("127.0.0.1") | Some("[::1]")
            ),
            _ => false,
        },
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registry_json() -> serde_json::Value {
        serde_json::json!({
            "schemaVersion": 2,
            "name": "DevToolBox Official",
            "plugins": [
                {
                    "manifest": {
                        "schemaVersion": 2,
                        "id": "market-ip-lookup",
                        "name": "IP Lookup",
                        "description": "Look up IP geolocation",
                        "version": "1.0.0",
                        "sdkVersion": "2.0",
                        "entry": "package/index.html",
                        "categoryId": "network-tools",
                        "author": "DevToolBox",
                        "license": "Apache-2.0",
                        "permissions": ["storage:kv"],
                        "httpDomains": []
                    },
                    "downloadUrl": "https://github.com/example/releases/download/marketplace/market-ip-lookup-1.0.0.zip",
                    "sha256": "a".repeat(64),
                    "size": 1234,
                    "publishedAt": "2026-01-01T00:00:00Z",
                    "status": "active"
                }
            ]
        })
    }

    #[test]
    fn parses_valid_registry() {
        let bytes = serde_json::to_vec(&registry_json()).unwrap();
        let index = RegistryIndex::parse(&bytes).unwrap();
        assert_eq!(index.plugins.len(), 1);
        assert_eq!(index.schema_version, 2);
    }

    #[test]
    fn rejects_bad_sha256() {
        let mut value = registry_json();
        value["plugins"][0]["sha256"] = serde_json::json!("not-a-hash");
        let bytes = serde_json::to_vec(&value).unwrap();
        let err = RegistryIndex::parse(&bytes).unwrap_err();
        assert!(err.to_string().contains("sha256"));
    }

    #[test]
    fn rejects_insecure_download_url() {
        let mut value = registry_json();
        value["plugins"][0]["downloadUrl"] = serde_json::json!("http://example.com/p.zip");
        let bytes = serde_json::to_vec(&value).unwrap();
        assert!(RegistryIndex::parse(&bytes).is_err());
    }

    #[test]
    fn latest_picks_highest_semver_and_skips_yanked() {
        let mut value = registry_json();
        let mut second = value["plugins"][0].clone();
        second["manifest"]["version"] = serde_json::json!("1.10.0");
        second["sha256"] = serde_json::json!("b".repeat(64));
        let mut third = value["plugins"][0].clone();
        third["manifest"]["version"] = serde_json::json!("2.0.0");
        third["sha256"] = serde_json::json!("c".repeat(64));
        third["status"] = serde_json::json!("yanked");
        value["plugins"] = serde_json::json!([value["plugins"][0].clone(), second, third]);

        let index = RegistryIndex::parse(&serde_json::to_vec(&value).unwrap()).unwrap();
        let id = PluginId::new("market-ip-lookup").unwrap();
        assert_eq!(index.latest(&id).unwrap().manifest.version, "1.10.0");
    }
}
