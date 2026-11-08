//! The plugin manifest: the single source of truth for a Marketplace plugin.
//!
//! The manifest is authored by third parties, validated by the host before
//! installation, copied unchanged into Marketplace registry indexes, and
//! rendered by the install-consent UI. It must therefore stay small, explicit,
//! and forward compatible.

use serde::{Deserialize, Serialize};

use crate::domain::DomainPattern;
use crate::error::{DevDeckError, ValidationIssue};
use crate::ids::{is_valid_slug, PluginId, MAX_SLUG_LEN};
use crate::permission::Permission;
use crate::{SDK_MAJOR, SUPPORTED_MANIFEST_SCHEMA};

/// Manifest schema emitted by current tooling.
pub const CURRENT_SCHEMA_VERSION: u32 = 2;

fn default_sdk_version() -> String {
    crate::SDK_VERSION.to_string()
}

fn default_schema_version() -> u32 {
    CURRENT_SCHEMA_VERSION
}

/// Plugin author: either a bare name or a structured record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PluginAuthor {
    Detailed {
        name: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        url: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        email: Option<String>,
    },
    Name(String),
}

impl Default for PluginAuthor {
    fn default() -> Self {
        PluginAuthor::Name(String::new())
    }
}

impl PluginAuthor {
    pub fn name(&self) -> &str {
        match self {
            PluginAuthor::Detailed { name, .. } => name,
            PluginAuthor::Name(name) => name,
        }
    }

    pub fn is_empty(&self) -> bool {
        self.name().trim().is_empty()
    }
}

/// A Marketplace plugin manifest (`manifest.json` at the package root).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    /// Manifest schema version. Absent means legacy schema 1.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub schema_version: Option<u32>,

    /// Globally unique, lowercase slug. Renaming a published id is forbidden.
    pub id: PluginId,

    /// Display name shown in the Marketplace and tool list.
    pub name: String,

    #[serde(default)]
    pub description: String,

    /// SemVer version of this plugin release.
    pub version: String,

    /// SDK major.minor the plugin was built against.
    #[serde(default = "default_sdk_version")]
    pub sdk_version: String,

    /// HTML entry file, relative to the package root, e.g. `package/index.html`.
    pub entry: String,

    /// Category slug used for Marketplace grouping.
    #[serde(default, alias = "category")]
    pub category_id: String,

    #[serde(default)]
    pub author: PluginAuthor,

    #[serde(default)]
    pub license: String,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,

    /// Path (inside the package) to a 128x128 PNG used in the Marketplace.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,

    #[serde(default)]
    pub keywords: Vec<String>,

    /// Capabilities the host must grant before the plugin can use them.
    #[serde(default)]
    pub permissions: Vec<Permission>,

    /// Allowlisted hosts for `http:*`. Required for schema 2 when HTTP is used.
    #[serde(default)]
    pub http_domains: Vec<String>,

    /// Allowlisted environment variables for `system:env:read`.
    #[serde(default)]
    pub env_allowlist: Vec<String>,

    /// Minimum DevDeck version that can run this plugin.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min_app_version: Option<String>,
}

impl PluginManifest {
    /// Parse a manifest from bytes, returning structured validation issues on
    /// malformed JSON so registry tooling can report precise errors.
    pub fn from_slice(bytes: &[u8]) -> Result<Self, DevDeckError> {
        serde_json::from_slice(bytes)
            .map_err(|err| DevDeckError::InvalidManifest(format!("malformed JSON: {err}")))
    }

    /// Schema version with the legacy default applied.
    pub fn effective_schema_version(&self) -> u32 {
        self.schema_version.unwrap_or(1)
    }

    /// Legacy plugins built for the 1.x SDK keep working but are flagged.
    pub fn is_legacy(&self) -> bool {
        self.effective_schema_version() < CURRENT_SCHEMA_VERSION
    }

    pub fn has_permission(&self, permission: Permission) -> bool {
        self.permissions.contains(&permission)
    }

    pub fn needs_http_allowlist(&self) -> bool {
        self.has_permission(Permission::HttpExternal) || self.has_permission(Permission::HttpProxy)
    }

    /// Validate every invariant the host relies on.
    ///
    /// Returns findings in a stable order. Callers reject the manifest when any
    /// finding has [`crate::Severity::Error`].
    pub fn validate(&self) -> Vec<ValidationIssue> {
        let mut issues = Vec::new();
        let schema = self.effective_schema_version();

        if self
            .schema_version
            .is_some_and(|v| v == 0 || v > SUPPORTED_MANIFEST_SCHEMA)
        {
            issues.push(ValidationIssue::error(
                "schemaVersion",
                "unsupported_schema",
                format!(
                    "schemaVersion {} is not supported (this build supports 1..={SUPPORTED_MANIFEST_SCHEMA})",
                    self.schema_version.unwrap_or_default()
                ),
            ));
        }

        if !is_valid_slug(self.id.as_str()) {
            issues.push(ValidationIssue::error(
                "id",
                "invalid_plugin_id",
                "plugin id must be a lowercase slug of at most 64 characters",
            ));
        }

        if self.name.trim().is_empty() {
            issues.push(ValidationIssue::error(
                "name",
                "missing_name",
                "name is required",
            ));
        } else if self.name.chars().count() > 64 {
            issues.push(ValidationIssue::error(
                "name",
                "name_too_long",
                "name must be at most 64 characters",
            ));
        }

        if self.description.chars().count() > 512 {
            issues.push(ValidationIssue::error(
                "description",
                "description_too_long",
                "description must be at most 512 characters",
            ));
        } else if self.description.trim().is_empty() {
            issues.push(ValidationIssue::warning(
                "description",
                "missing_description",
                "a short description helps users find the plugin",
            ));
        }

        if semver::Version::parse(&self.version).is_err() {
            issues.push(ValidationIssue::error(
                "version",
                "invalid_version",
                "version must be a valid SemVer string such as 1.2.3",
            ));
        }

        match parse_sdk_major(&self.sdk_version) {
            None => issues.push(ValidationIssue::error(
                "sdkVersion",
                "invalid_sdk_version",
                "sdkVersion must look like \"2.0\"",
            )),
            Some(major) if major > SDK_MAJOR => issues.push(ValidationIssue::error(
                "sdkVersion",
                "sdk_too_new",
                format!("plugin targets SDK {major}.x but this build provides {SDK_MAJOR}.x"),
            )),
            Some(major) if major < SDK_MAJOR => issues.push(ValidationIssue::warning(
                "sdkVersion",
                "legacy_sdk",
                format!("plugin targets SDK {major}.x; migrate to {SDK_MAJOR}.x"),
            )),
            Some(_) => {}
        }

        issues.extend(validate_entry(&self.entry));

        if !is_valid_slug(&self.category_id) {
            issues.push(ValidationIssue::error(
                "categoryId",
                "invalid_category",
                format!("category must be a lowercase slug of at most {MAX_SLUG_LEN} characters"),
            ));
        }

        if self.author.is_empty() {
            issues.push(ValidationIssue::warning(
                "author",
                "missing_author",
                "author is required for Marketplace listings",
            ));
        }

        if self.license.trim().is_empty() {
            issues.push(ValidationIssue::error(
                "license",
                "missing_license",
                "an SPDX license identifier is required for Marketplace distribution",
            ));
        }

        if let Some(icon) = &self.icon {
            if !is_safe_relative(icon) {
                issues.push(ValidationIssue::error(
                    "icon",
                    "unsafe_icon_path",
                    "icon must be a relative path inside the package without '..'",
                ));
            }
        }

        if let Some(min_app_version) = &self.min_app_version {
            if semver::Version::parse(min_app_version).is_err() {
                issues.push(ValidationIssue::error(
                    "minAppVersion",
                    "invalid_min_app_version",
                    "minAppVersion must be a valid SemVer string",
                ));
            }
        }

        // Permissions this build cannot satisfy are accepted for compatibility
        // but flagged so authors and reviewers notice.
        for (index, permission) in self.permissions.iter().enumerate() {
            if !permission.is_implemented() {
                issues.push(ValidationIssue::warning(
                    format!("permissions[{index}]"),
                    "unimplemented_permission",
                    format!(
                        "permission '{}' is reserved and not available in this build",
                        permission.as_str()
                    ),
                ));
            }
        }

        // Duplicate permissions are a packaging bug: the consent screen must
        // show each capability exactly once.
        let mut seen = std::collections::BTreeSet::new();
        for (index, permission) in self.permissions.iter().enumerate() {
            if !seen.insert(*permission) {
                issues.push(ValidationIssue::error(
                    format!("permissions[{index}]"),
                    "duplicate_permission",
                    format!(
                        "permission '{}' is listed more than once",
                        permission.as_str()
                    ),
                ));
            }
        }

        // HTTP access always needs an explicit allowlist in schema 2. Legacy
        // manifests keep the old rule (only `http:external` required domains).
        let http_allowlist_required = self.has_permission(Permission::HttpExternal)
            || (schema >= 2 && self.has_permission(Permission::HttpProxy));
        if http_allowlist_required && self.http_domains.is_empty() {
            issues.push(ValidationIssue::error(
                "httpDomains",
                "http_domains_required",
                "httpDomains must list every host the plugin may contact",
            ));
        }
        for (index, raw) in self.http_domains.iter().enumerate() {
            if let Err(err) = DomainPattern::parse(raw) {
                issues.push(ValidationIssue::error(
                    format!("httpDomains[{index}]"),
                    "invalid_http_domain",
                    err.to_string(),
                ));
            }
        }

        if self.has_permission(Permission::SystemEnvRead) && self.env_allowlist.is_empty() {
            issues.push(ValidationIssue::error(
                "envAllowlist",
                "env_allowlist_required",
                "envAllowlist must list every environment variable the plugin may read",
            ));
        }
        for (index, name) in self.env_allowlist.iter().enumerate() {
            if !is_valid_env_name(name) {
                issues.push(ValidationIssue::error(
                    format!("envAllowlist[{index}]"),
                    "invalid_env_name",
                    "environment variable names must match [A-Z_][A-Z0-9_]*",
                ));
            }
        }

        issues
    }

    /// Convenience wrapper: `Err` when any validation finding is an error.
    pub fn validate_strict(&self) -> Result<(), DevDeckError> {
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
        Err(DevDeckError::InvalidManifest(summary))
    }
}

fn parse_sdk_major(value: &str) -> Option<u32> {
    let trimmed = value.trim();
    let mut parts = trimmed.split('.');
    let major = parts.next()?.parse::<u32>().ok()?;
    for part in parts {
        if part.is_empty() || part.parse::<u32>().is_err() {
            return None;
        }
    }
    Some(major)
}

fn validate_entry(entry: &str) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    if entry.trim().is_empty() {
        issues.push(ValidationIssue::error(
            "entry",
            "missing_entry",
            "entry must point at the plugin HTML file",
        ));
        return issues;
    }
    if !is_safe_relative(entry) {
        issues.push(ValidationIssue::error(
            "entry",
            "unsafe_entry_path",
            "entry must be a relative path inside the package without '..' or a leading slash",
        ));
        return issues;
    }
    if !entry.to_ascii_lowercase().ends_with(".html") {
        issues.push(ValidationIssue::error(
            "entry",
            "invalid_entry_extension",
            "entry must be an .html file",
        ));
    }
    issues
}

/// Rejects absolute paths, Windows separators, and parent traversal.
pub fn is_safe_relative(path: &str) -> bool {
    if path.is_empty() || path.starts_with('/') || path.starts_with('\\') {
        return false;
    }
    if path.contains('\\') || path.contains('\0') {
        return false;
    }
    path.split('/').all(|segment| {
        !segment.is_empty() && segment != "." && segment != ".." && !segment.contains(':')
    })
}

fn is_valid_env_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.is_empty() {
        return false;
    }
    let first = bytes[0];
    if !(first.is_ascii_uppercase() || first == b'_') {
        return false;
    }
    bytes
        .iter()
        .all(|b| b.is_ascii_uppercase() || b.is_ascii_digit() || *b == b'_')
}

/// Default schema version used when tooling writes a new manifest.
pub fn current_schema_version() -> u32 {
    default_schema_version()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_manifest() -> PluginManifest {
        serde_json::from_value(serde_json::json!({
            "schemaVersion": 2,
            "id": "market-ip-lookup",
            "name": "IP Lookup",
            "description": "Look up IP geolocation",
            "version": "1.0.0",
            "sdkVersion": "2.0",
            "entry": "package/index.html",
            "categoryId": "network-tools",
            "author": "DevDeck",
            "license": "Apache-2.0",
            "permissions": ["storage:kv", "http:proxy"],
            "httpDomains": ["api.ip2location.io"]
        }))
        .unwrap()
    }

    #[test]
    fn valid_manifest_has_no_errors() {
        let manifest = base_manifest();
        let issues = manifest.validate();
        assert!(
            issues.iter().all(|i| !i.is_error()),
            "unexpected errors: {issues:?}"
        );
        manifest.validate_strict().unwrap();
    }

    #[test]
    fn parses_legacy_v1_manifest() {
        let manifest: PluginManifest = serde_json::from_value(serde_json::json!({
            "id": "market-emoji-search",
            "name": "Emoji Search",
            "description": "Filter and search emoji",
            "version": "0.1.0",
            "sdkVersion": "1.0",
            "entry": "package/index.html",
            "categoryId": "text-tools",
            "author": "DevDeck",
            "license": "Apache-2.0",
            "permissions": ["storage:kv"]
        }))
        .unwrap();
        assert!(manifest.is_legacy());
        let issues = manifest.validate();
        assert!(issues.iter().any(|i| i.code == "legacy_sdk"));
        assert!(issues.iter().all(|i| !i.is_error()));
    }

    #[test]
    fn rejects_missing_http_allowlist_for_schema_2() {
        let mut manifest = base_manifest();
        manifest.http_domains.clear();
        let issues = manifest.validate();
        assert!(issues.iter().any(|i| i.code == "http_domains_required"));
    }

    #[test]
    fn rejects_entry_traversal() {
        for entry in [
            "../package/index.html",
            "/etc/index.html",
            "package\\index.html",
            "a//b.html",
        ] {
            let mut manifest = base_manifest();
            manifest.entry = entry.to_string();
            let issues = manifest.validate();
            assert!(
                issues.iter().any(|i| i.code == "unsafe_entry_path"),
                "{entry} should be rejected"
            );
        }
    }

    #[test]
    fn rejects_unknown_permission() {
        let err = serde_json::from_value::<PluginManifest>(serde_json::json!({
            "id": "x",
            "name": "X",
            "version": "1.0.0",
            "entry": "package/index.html",
            "categoryId": "tools",
            "license": "MIT",
            "permissions": ["net:quic"]
        }))
        .unwrap_err();
        assert!(err.to_string().contains("net:quic"));
    }

    #[test]
    fn env_permission_requires_allowlist() {
        let mut manifest = base_manifest();
        manifest.permissions.push(Permission::SystemEnvRead);
        let issues = manifest.validate();
        assert!(issues.iter().any(|i| i.code == "env_allowlist_required"));
        manifest.env_allowlist = vec!["HOME".to_string()];
        manifest.validate_strict().unwrap();
    }

    #[test]
    fn reserved_permissions_produce_warnings_only() {
        let mut manifest = base_manifest();
        manifest.permissions.push(Permission::Bluetooth);
        manifest.permissions.push(Permission::Serial);
        let issues = manifest.validate();
        assert_eq!(
            issues
                .iter()
                .filter(|issue| issue.code == "unimplemented_permission")
                .count(),
            2
        );
        assert!(issues.iter().all(|issue| !issue.is_error()));
        manifest.validate_strict().unwrap();
    }

    #[test]
    fn duplicate_permissions_are_rejected() {
        let mut manifest = base_manifest();
        manifest.permissions.push(Permission::StorageKv);
        let issues = manifest.validate();
        assert!(issues.iter().any(|i| i.code == "duplicate_permission"));
    }

    #[test]
    fn structured_author_round_trips() {
        let manifest: PluginManifest = serde_json::from_value(serde_json::json!({
            "id": "x",
            "name": "X",
            "version": "1.0.0",
            "entry": "package/index.html",
            "categoryId": "tools",
            "license": "MIT",
            "author": { "name": "Jane", "url": "https://example.com" }
        }))
        .unwrap();
        assert_eq!(manifest.author.name(), "Jane");
        let round = serde_json::to_value(&manifest).unwrap();
        assert_eq!(round["author"]["name"], "Jane");
    }
}
