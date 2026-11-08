use std::collections::BTreeSet;

use devdeck_contract::{
    DevDeckError, DomainPattern, Permission, PermissionSet, PluginId, PluginManifest,
};
use serde::{Deserialize, Serialize};
use url::Url;

/// Capabilities granted to a single installed plugin.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Grant {
    pub plugin_id: PluginId,
    pub permissions: PermissionSet,
    pub http_domains: Vec<DomainPattern>,
    pub env_allowlist: BTreeSet<String>,
    /// Schema 2 manifests must declare a non-empty HTTP allowlist. Legacy
    /// schema 1 manifests are tolerated but still restricted to HTTPS.
    pub require_http_allowlist: bool,
    pub granted_at_ms: u64,
}

impl Grant {
    /// Build a grant from a manifest. The manifest is expected to have passed
    /// [`PluginManifest::validate_strict`], but every value used for
    /// enforcement is re-parsed here so a corrupted state file cannot widen a
    /// grant.
    pub fn from_manifest(
        manifest: &PluginManifest,
        granted_at_ms: u64,
    ) -> Result<Self, DevDeckError> {
        let permissions: PermissionSet = manifest.permissions.iter().copied().collect();

        let mut http_domains = Vec::with_capacity(manifest.http_domains.len());
        for raw in &manifest.http_domains {
            http_domains.push(DomainPattern::parse(raw)?);
        }

        let mut env_allowlist = BTreeSet::new();
        for name in &manifest.env_allowlist {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                return Err(DevDeckError::InvalidArgument(
                    "envAllowlist must not contain empty names".to_string(),
                ));
            }
            env_allowlist.insert(trimmed.to_string());
        }

        Ok(Self {
            plugin_id: manifest.id.clone(),
            permissions,
            http_domains,
            env_allowlist,
            require_http_allowlist: manifest.effective_schema_version() >= 2,
            granted_at_ms,
        })
    }

    pub fn allows(&self, permission: Permission) -> bool {
        self.permissions.contains(permission)
    }
}

/// Renderer-friendly projection of a grant (used by the consent screen and the
/// plugin's own capability introspection call).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrantSummary {
    pub plugin_id: PluginId,
    pub permissions: Vec<Permission>,
    pub http_domains: Vec<String>,
    pub env_allowlist: Vec<String>,
    pub granted_at_ms: u64,
}

/// Central authority for plugin capabilities.
#[derive(Debug, Default)]
pub struct CapabilityBroker {
    grants: std::collections::BTreeMap<PluginId, Grant>,
}

impl CapabilityBroker {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register (or replace) the grant for a plugin.
    pub fn grant(&mut self, grant: Grant) {
        self.grants.insert(grant.plugin_id.clone(), grant);
    }

    /// Derive and register a grant from a manifest.
    pub fn grant_manifest(
        &mut self,
        manifest: &PluginManifest,
        now_ms: u64,
    ) -> Result<&Grant, DevDeckError> {
        let grant = Grant::from_manifest(manifest, now_ms)?;
        let id = grant.plugin_id.clone();
        self.grants.insert(id.clone(), grant);
        Ok(self.grants.get(&id).expect("grant was just inserted"))
    }

    /// Remove a plugin's grant. Returns `true` when a grant existed.
    pub fn revoke(&mut self, id: &PluginId) -> bool {
        self.grants.remove(id).is_some()
    }

    pub fn grant_of(&self, id: &PluginId) -> Option<&Grant> {
        self.grants.get(id)
    }

    pub fn summary(&self, id: &PluginId) -> Option<GrantSummary> {
        self.grants.get(id).map(|grant| GrantSummary {
            plugin_id: grant.plugin_id.clone(),
            permissions: grant.permissions.iter().copied().collect(),
            http_domains: grant.http_domains.iter().map(|d| d.to_string()).collect(),
            env_allowlist: grant.env_allowlist.iter().cloned().collect(),
            granted_at_ms: grant.granted_at_ms,
        })
    }

    /// Require a permission, returning the plugin's grant on success.
    pub fn require(&self, id: &PluginId, permission: Permission) -> Result<&Grant, DevDeckError> {
        let grant = self.grants.get(id).ok_or_else(|| {
            DevDeckError::denied(format!("plugin '{id}' has no capability grant"))
        })?;
        if !grant.allows(permission) {
            return Err(DevDeckError::denied(format!(
                "plugin '{id}' is missing permission '{}'",
                permission.as_str()
            )));
        }
        Ok(grant)
    }

    /// Validate an outbound HTTP request against the plugin's allowlist.
    ///
    /// Returns the parsed URL so callers cannot accidentally re-parse a
    /// different string (a classic TOCTOU bug in URL allowlists).
    pub fn authorize_http(&self, id: &PluginId, raw_url: &str) -> Result<Url, DevDeckError> {
        let grant = self.require_any_http(id)?;
        let url = Url::parse(raw_url)
            .map_err(|err| DevDeckError::InvalidArgument(format!("invalid URL: {err}")))?;

        if !matches!(url.scheme(), "http" | "https") {
            return Err(DevDeckError::denied(format!(
                "scheme '{}' is not allowed for plugin HTTP requests",
                url.scheme()
            )));
        }
        if !url.username().is_empty() || url.password().is_some() {
            return Err(DevDeckError::denied(
                "URLs with embedded credentials are not allowed",
            ));
        }
        let host = url
            .host_str()
            .ok_or_else(|| DevDeckError::InvalidArgument("URL has no host".to_string()))?;
        let host = host.trim_start_matches('[').trim_end_matches(']');

        if grant.http_domains.is_empty() {
            if grant.require_http_allowlist {
                return Err(DevDeckError::denied(
                    "plugin declares HTTP access but no httpDomains allowlist",
                ));
            }
            if url.scheme() != "https" {
                return Err(DevDeckError::denied(
                    "legacy plugins without an allowlist may only use https",
                ));
            }
            return Ok(url);
        }

        if grant
            .http_domains
            .iter()
            .any(|pattern| pattern.matches(host))
        {
            Ok(url)
        } else {
            Err(DevDeckError::denied(format!(
                "host '{host}' is not in the plugin's httpDomains allowlist"
            )))
        }
    }

    fn require_any_http(&self, id: &PluginId) -> Result<&Grant, DevDeckError> {
        let grant = self.grants.get(id).ok_or_else(|| {
            DevDeckError::denied(format!("plugin '{id}' has no capability grant"))
        })?;
        if grant.allows(Permission::HttpProxy) || grant.allows(Permission::HttpExternal) {
            Ok(grant)
        } else {
            Err(DevDeckError::denied(format!(
                "plugin '{id}' is missing permission 'http:proxy' or 'http:external'"
            )))
        }
    }

    /// Validate access to an environment variable.
    pub fn authorize_env(&self, id: &PluginId, name: &str) -> Result<String, DevDeckError> {
        let grant = self.require(id, Permission::SystemEnvRead)?;
        if grant.env_allowlist.contains(name) {
            Ok(name.to_string())
        } else {
            Err(DevDeckError::denied(format!(
                "environment variable '{name}' is not in the plugin's envAllowlist"
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use devdeck_contract::PluginManifest;
    use serde_json::json;

    fn manifest(extra: serde_json::Value) -> PluginManifest {
        let mut base = json!({
            "schemaVersion": 2,
            "id": "market-test",
            "name": "Test",
            "description": "test plugin",
            "version": "1.0.0",
            "sdkVersion": "2.0",
            "entry": "package/index.html",
            "categoryId": "network-tools",
            "author": "DevDeck",
            "license": "MIT",
            "permissions": ["storage:kv"],
            "httpDomains": []
        });
        for (key, value) in extra.as_object().unwrap() {
            base[key] = value.clone();
        }
        serde_json::from_value(base).unwrap()
    }

    fn broker_for(m: &PluginManifest) -> (CapabilityBroker, PluginId) {
        let mut broker = CapabilityBroker::new();
        broker.grant_manifest(m, 1).unwrap();
        (broker, m.id.clone())
    }

    #[test]
    fn storage_permission_is_enforced() {
        let m = manifest(json!({}));
        let (broker, id) = broker_for(&m);
        assert!(broker.require(&id, Permission::StorageKv).is_ok());
        assert_eq!(
            broker.require(&id, Permission::NetSsh).unwrap_err().code(),
            "permission_denied"
        );
    }

    #[test]
    fn unknown_plugin_has_no_capabilities() {
        let broker = CapabilityBroker::new();
        let id = PluginId::new("market-ghost").unwrap();
        assert_eq!(
            broker
                .require(&id, Permission::LogWrite)
                .unwrap_err()
                .code(),
            "permission_denied"
        );
    }

    #[test]
    fn http_requires_allowlist_match() {
        let m = manifest(json!({
            "permissions": ["http:proxy"],
            "httpDomains": ["api.example.com", "*.cdn.example.com"]
        }));
        let (broker, id) = broker_for(&m);
        assert!(broker
            .authorize_http(&id, "https://api.example.com/v1")
            .is_ok());
        assert!(broker
            .authorize_http(&id, "https://img.cdn.example.com/a.png")
            .is_ok());
        assert!(broker.authorize_http(&id, "https://evil.com/").is_err());
        assert!(broker
            .authorize_http(&id, "https://api.example.com.evil.test/")
            .is_err());
    }

    #[test]
    fn http_rejects_non_https_schemes_and_credentials() {
        let m = manifest(json!({
            "permissions": ["http:proxy"],
            "httpDomains": ["api.example.com"]
        }));
        let (broker, id) = broker_for(&m);
        assert!(broker.authorize_http(&id, "file:///etc/passwd").is_err());
        assert!(broker
            .authorize_http(&id, "https://user:pass@api.example.com/")
            .is_err());
    }

    #[test]
    fn empty_allowlist_is_denied_for_schema_2() {
        let m = manifest(json!({ "permissions": ["http:proxy"] }));
        let (broker, id) = broker_for(&m);
        assert!(broker
            .authorize_http(&id, "https://api.example.com")
            .is_err());
    }

    #[test]
    fn legacy_manifest_without_allowlist_is_limited_to_https() {
        let m: PluginManifest = serde_json::from_value(json!({
            "id": "market-legacy",
            "name": "Legacy",
            "description": "legacy",
            "version": "1.0.0",
            "sdkVersion": "1.0",
            "entry": "package/index.html",
            "categoryId": "tools",
            "author": "DevDeck",
            "license": "MIT",
            "permissions": ["http:proxy"]
        }))
        .unwrap();
        let (broker, id) = broker_for(&m);
        assert!(broker.authorize_http(&id, "https://example.com").is_ok());
        assert!(broker.authorize_http(&id, "http://example.com").is_err());
    }

    #[test]
    fn env_allowlist_is_enforced() {
        let m = manifest(json!({
            "permissions": ["system:env:read"],
            "envAllowlist": ["HOME"]
        }));
        let (broker, id) = broker_for(&m);
        assert!(broker.authorize_env(&id, "HOME").is_ok());
        assert!(broker.authorize_env(&id, "PATH").is_err());
    }

    #[test]
    fn revoking_removes_everything() {
        let m = manifest(json!({}));
        let (mut broker, id) = broker_for(&m);
        assert!(broker.revoke(&id));
        assert!(broker.require(&id, Permission::StorageKv).is_err());
        assert!(broker.summary(&id).is_none());
    }
}
