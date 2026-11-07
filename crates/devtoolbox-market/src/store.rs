//! Install state machine for Marketplace plugins.
//!
//! Layout under the app data directory:
//!
//! ```text
//! <root>/
//!   marketplace-state.json   installed plugin records (source of truth)
//!   plugins/<plugin-id>/     unpacked plugin package (manifest.json + entry)
//!   .staging/                transient extraction/backup directories
//!   plugin-data/<plugin-id>/ per-plugin key/value storage (runtime)
//! ```
//!
//! Installs are staged and then moved into place, so a failed extraction never
//! leaves a half-installed plugin behind.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use devtoolbox_contract::{DevToolboxError, PluginId, PluginManifest, RegistryIndex};
use serde::{Deserialize, Serialize};

use crate::package::{copy_directory, extract_zip, read_manifest, validate_layout, InstallLimits};
use crate::signing::{verify_detached_signature, verify_sha256};

const STATE_FILE: &str = "marketplace-state.json";
const STATE_SCHEMA_VERSION: u32 = 1;
const PLUGINS_DIR: &str = "plugins";
const STAGING_DIR: &str = ".staging";

static STAGING_COUNTER: AtomicU64 = AtomicU64::new(0);

/// Where an installed plugin came from.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
pub enum InstallSource {
    /// Installed from a registry entry (value: registry name or URL).
    Registry(String),
    /// Installed from a local `.zip` or folder the user picked.
    LocalFile(String),
    /// Installed from a `pnpm dev` style working copy.
    Development,
}

/// A plugin as seen by the host and the renderer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPlugin {
    pub manifest: PluginManifest,
    pub enabled: bool,
    #[serde(rename = "installedAtMs")]
    pub installed_at_ms: u64,
    pub source: InstallSource,
    #[serde(skip)]
    pub dir: PathBuf,
}

/// Detached signature the installer must verify before extracting.
#[derive(Debug, Clone)]
pub struct SignatureExpectation {
    pub public_key_base64: String,
    pub signature_base64: String,
}

/// Options for one install operation.
#[derive(Debug, Clone, Default)]
pub struct InstallOptions {
    /// Expected lowercase hex SHA-256 of the package bytes.
    pub expected_sha256: Option<String>,
    /// Optional Ed25519 signature over the package bytes.
    pub signature: Option<SignatureExpectation>,
    /// Allow installing an older version over a newer one.
    pub allow_downgrade: bool,
    pub limits: InstallLimits,
}

impl InstallOptions {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_sha256(mut self, sha256: impl Into<String>) -> Self {
        self.expected_sha256 = Some(sha256.into());
        self
    }

    pub fn with_signature(
        mut self,
        public_key_base64: impl Into<String>,
        signature_base64: impl Into<String>,
    ) -> Self {
        self.signature = Some(SignatureExpectation {
            public_key_base64: public_key_base64.into(),
            signature_base64: signature_base64.into(),
        });
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MarketState {
    #[serde(default = "default_state_schema")]
    schema_version: u32,
    #[serde(default)]
    plugins: BTreeMap<String, StoredPlugin>,
}

impl Default for MarketState {
    fn default() -> Self {
        Self {
            schema_version: STATE_SCHEMA_VERSION,
            plugins: BTreeMap::new(),
        }
    }
}

fn default_state_schema() -> u32 {
    STATE_SCHEMA_VERSION
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredPlugin {
    manifest: PluginManifest,
    enabled: bool,
    installed_at_ms: u64,
    source: InstallSource,
}

/// The Marketplace engine.
#[derive(Debug)]
pub struct MarketplaceService {
    root: PathBuf,
    state: MarketState,
}

impl MarketplaceService {
    /// Open (or initialize) the marketplace rooted at `root`.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self, DevToolboxError> {
        let root = root.into();
        std::fs::create_dir_all(root.join(PLUGINS_DIR))?;
        std::fs::create_dir_all(root.join(STAGING_DIR))?;

        let state_path = root.join(STATE_FILE);
        let state = match std::fs::read(&state_path) {
            Ok(bytes) => {
                let state: MarketState = serde_json::from_slice(&bytes).map_err(|err| {
                    DevToolboxError::InvalidArgument(format!(
                        "marketplace state is unreadable: {err}"
                    ))
                })?;
                if state.schema_version > STATE_SCHEMA_VERSION {
                    return Err(DevToolboxError::Unsupported(format!(
                        "marketplace state schema {} is newer than this build supports ({STATE_SCHEMA_VERSION})",
                        state.schema_version
                    )));
                }
                state
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => MarketState::default(),
            Err(err) => return Err(err.into()),
        };

        Ok(Self { root, state })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn state_path(&self) -> PathBuf {
        self.root.join(STATE_FILE)
    }

    pub fn plugins_dir(&self) -> PathBuf {
        self.root.join(PLUGINS_DIR)
    }

    pub fn plugin_dir(&self, id: &PluginId) -> PathBuf {
        self.plugins_dir().join(id.as_str())
    }

    fn staging_root(&self) -> PathBuf {
        self.root.join(STAGING_DIR)
    }

    /// Every installed plugin, sorted by display name.
    pub fn list(&self) -> Vec<InstalledPlugin> {
        let mut items: Vec<InstalledPlugin> = self
            .state
            .plugins
            .values()
            .map(|stored| self.to_installed(stored))
            .collect();
        items.sort_by(|a, b| {
            a.manifest
                .name
                .to_lowercase()
                .cmp(&b.manifest.name.to_lowercase())
                .then_with(|| a.manifest.id.cmp(&b.manifest.id))
        });
        items
    }

    pub fn get(&self, id: &PluginId) -> Option<InstalledPlugin> {
        self.state
            .plugins
            .get(id.as_str())
            .map(|stored| self.to_installed(stored))
    }

    pub fn is_enabled(&self, id: &PluginId) -> bool {
        self.state
            .plugins
            .get(id.as_str())
            .map(|stored| stored.enabled)
            .unwrap_or(false)
    }

    /// Drop state records whose plugin directory was removed outside the app.
    /// Returns `true` when the state changed.
    pub fn reconcile(&mut self) -> bool {
        let missing: Vec<String> = self
            .state
            .plugins
            .iter()
            .filter(|(id, _)| {
                PluginId::new(id.as_str())
                    .map(|id| !self.plugin_dir(&id).join("manifest.json").is_file())
                    .unwrap_or(true)
            })
            .map(|(id, _)| id.clone())
            .collect();
        for id in &missing {
            self.state.plugins.remove(id);
        }
        !missing.is_empty()
    }

    /// Install a plugin from `.zip` bytes.
    pub fn install_zip(
        &mut self,
        bytes: &[u8],
        source: InstallSource,
        options: &InstallOptions,
        now_ms: u64,
    ) -> Result<InstalledPlugin, DevToolboxError> {
        if let Some(expected) = options.expected_sha256.as_deref() {
            verify_sha256(bytes, expected)?;
        }
        if let Some(signature) = &options.signature {
            verify_detached_signature(
                &signature.public_key_base64,
                bytes,
                &signature.signature_base64,
            )?;
        }

        let staging = self.create_staging_dir(now_ms);
        let result = extract_zip(bytes, &staging, &options.limits)
            .and_then(|_| self.finalize(&staging, source, options, now_ms));
        self.cleanup_staging(&staging);
        result
    }

    /// Install from an unpacked directory (local development / drag-and-drop).
    pub fn install_dir(
        &mut self,
        src: &Path,
        source: InstallSource,
        options: &InstallOptions,
        now_ms: u64,
    ) -> Result<InstalledPlugin, DevToolboxError> {
        if !src.is_dir() {
            return Err(DevToolboxError::InvalidArgument(format!(
                "'{}' is not a directory",
                src.display()
            )));
        }
        let staging = self.create_staging_dir(now_ms);
        let result = copy_directory(src, &staging, &options.limits)
            .and_then(|_| self.finalize(&staging, source, options, now_ms));
        self.cleanup_staging(&staging);
        result
    }

    /// Uninstall a plugin and delete its files.
    pub fn uninstall(&mut self, id: &PluginId) -> Result<(), DevToolboxError> {
        if self.state.plugins.remove(id.as_str()).is_none() {
            return Err(DevToolboxError::NotFound(format!(
                "plugin '{id}' is not installed"
            )));
        }
        let dir = self.plugin_dir(id);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)?;
        }
        self.save()
    }

    /// Enable or disable a plugin without removing it.
    pub fn set_enabled(
        &mut self,
        id: &PluginId,
        enabled: bool,
    ) -> Result<InstalledPlugin, DevToolboxError> {
        let stored = {
            let stored = self.state.plugins.get_mut(id.as_str()).ok_or_else(|| {
                DevToolboxError::NotFound(format!("plugin '{id}' is not installed"))
            })?;
            stored.enabled = enabled;
            stored.clone()
        };
        let installed = self.to_installed(&stored);
        self.save()?;
        Ok(installed)
    }

    /// Parse and validate a `registry.json` document.
    pub fn load_registry(&self, bytes: &[u8]) -> Result<RegistryIndex, DevToolboxError> {
        RegistryIndex::parse(bytes)
    }

    /// Persist the state file atomically.
    pub fn save(&self) -> Result<(), DevToolboxError> {
        let path = self.state_path();
        let tmp = self.root.join(format!(".{STATE_FILE}.tmp"));
        let bytes = serde_json::to_vec_pretty(&self.state)?;
        std::fs::write(&tmp, bytes)?;
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }

    fn to_installed(&self, stored: &StoredPlugin) -> InstalledPlugin {
        let dir = PluginId::new(stored.manifest.id.as_str())
            .map(|id| self.plugin_dir(&id))
            .unwrap_or_else(|_| self.plugins_dir());
        InstalledPlugin {
            manifest: stored.manifest.clone(),
            enabled: stored.enabled,
            installed_at_ms: stored.installed_at_ms,
            source: stored.source.clone(),
            dir,
        }
    }

    fn create_staging_dir(&self, now_ms: u64) -> PathBuf {
        let unique = STAGING_COUNTER.fetch_add(1, Ordering::Relaxed);
        let dir = self
            .staging_root()
            .join(format!("{now_ms}-{}-{unique}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    fn cleanup_staging(&self, staging: &Path) {
        if staging.exists() {
            let _ = std::fs::remove_dir_all(staging);
        }
    }

    fn finalize(
        &mut self,
        staging: &Path,
        source: InstallSource,
        options: &InstallOptions,
        now_ms: u64,
    ) -> Result<InstalledPlugin, DevToolboxError> {
        let manifest = read_manifest(staging)?;
        validate_layout(staging, &manifest)?;
        let id = manifest.id.clone();

        let existing = self.state.plugins.get(id.as_str());
        if let Some(existing) = existing {
            if !options.allow_downgrade {
                if let (Ok(current), Ok(incoming)) = (
                    semver::Version::parse(&existing.manifest.version),
                    semver::Version::parse(&manifest.version),
                ) {
                    if incoming < current {
                        return Err(DevToolboxError::InvalidArgument(format!(
                            "refusing to downgrade '{id}' from {} to {}",
                            existing.manifest.version, manifest.version
                        )));
                    }
                }
            }
        }
        let enabled = existing.map(|stored| stored.enabled).unwrap_or(true);

        let target = self.plugin_dir(&id);
        if target.exists() {
            let backup = self.staging_root().join(format!("previous-{id}-{now_ms}"));
            self.cleanup_staging(&backup);
            std::fs::rename(&target, &backup)?;
            if let Err(err) = std::fs::rename(staging, &target) {
                let _ = std::fs::rename(&backup, &target);
                return Err(err.into());
            }
            let _ = std::fs::remove_dir_all(&backup);
        } else {
            std::fs::rename(staging, &target)?;
        }

        self.state.plugins.insert(
            id.to_string(),
            StoredPlugin {
                manifest: manifest.clone(),
                enabled,
                installed_at_ms: now_ms,
                source: source.clone(),
            },
        );
        self.save()?;

        Ok(InstalledPlugin {
            manifest,
            enabled,
            installed_at_ms: now_ms,
            source,
            dir: target,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures::{plugin_zip, sample_manifest};

    fn service(dir: &Path) -> MarketplaceService {
        MarketplaceService::open(dir).unwrap()
    }

    #[test]
    fn installs_and_lists_a_plugin() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let installed = market
            .install_zip(
                &plugin_zip(&sample_manifest("1.0.0")),
                InstallSource::Development,
                &InstallOptions::default(),
                1,
            )
            .unwrap();
        assert_eq!(installed.manifest.id.as_str(), "market-demo");
        assert!(installed.enabled);
        assert!(installed.dir.join("manifest.json").is_file());
        assert!(installed.dir.join("package/index.html").is_file());
        assert_eq!(market.list().len(), 1);
    }

    #[test]
    fn state_survives_reopen() {
        let dir = tempfile::tempdir().unwrap();
        {
            let mut market = service(dir.path());
            market
                .install_zip(
                    &plugin_zip(&sample_manifest("1.0.0")),
                    InstallSource::Development,
                    &InstallOptions::default(),
                    1,
                )
                .unwrap();
        }
        let reopened = service(dir.path());
        assert_eq!(reopened.list().len(), 1);
    }

    #[test]
    fn upgrade_preserves_enabled_flag() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let installed = market
            .install_zip(
                &plugin_zip(&sample_manifest("1.0.0")),
                InstallSource::Development,
                &InstallOptions::default(),
                1,
            )
            .unwrap();
        market.set_enabled(&installed.manifest.id, false).unwrap();
        let upgraded = market
            .install_zip(
                &plugin_zip(&sample_manifest("1.1.0")),
                InstallSource::Development,
                &InstallOptions::default(),
                2,
            )
            .unwrap();
        assert_eq!(upgraded.manifest.version, "1.1.0");
        assert!(!upgraded.enabled);
        assert_eq!(market.list().len(), 1);
    }

    #[test]
    fn downgrade_is_refused_by_default() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        market
            .install_zip(
                &plugin_zip(&sample_manifest("2.0.0")),
                InstallSource::Development,
                &InstallOptions::default(),
                1,
            )
            .unwrap();
        let err = market
            .install_zip(
                &plugin_zip(&sample_manifest("1.0.0")),
                InstallSource::Development,
                &InstallOptions::default(),
                2,
            )
            .unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
    }

    #[test]
    fn downgrade_can_be_allowed() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        market
            .install_zip(
                &plugin_zip(&sample_manifest("2.0.0")),
                InstallSource::Development,
                &InstallOptions::default(),
                1,
            )
            .unwrap();
        let options = InstallOptions {
            allow_downgrade: true,
            ..InstallOptions::default()
        };
        let installed = market
            .install_zip(
                &plugin_zip(&sample_manifest("1.0.0")),
                InstallSource::Development,
                &options,
                2,
            )
            .unwrap();
        assert_eq!(installed.manifest.version, "1.0.0");
    }

    #[test]
    fn sha256_mismatch_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let options = InstallOptions::new().with_sha256("0".repeat(64));
        let err = market
            .install_zip(
                &plugin_zip(&sample_manifest("1.0.0")),
                InstallSource::Development,
                &options,
                1,
            )
            .unwrap_err();
        assert_eq!(err.code(), "integrity_check_failed");
        assert!(market.list().is_empty());
    }

    #[test]
    fn sha256_match_is_accepted() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let zip = plugin_zip(&sample_manifest("1.0.0"));
        let options = InstallOptions::new().with_sha256(crate::signing::sha256_hex(&zip));
        market
            .install_zip(&zip, InstallSource::Development, &options, 1)
            .unwrap();
    }

    #[test]
    fn installs_from_a_development_folder() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("plugin-source");
        std::fs::create_dir_all(source.join("package")).unwrap();
        std::fs::write(
            source.join("manifest.json"),
            sample_manifest("1.2.3").to_string(),
        )
        .unwrap();
        std::fs::write(source.join("package/index.html"), b"<html></html>").unwrap();

        let mut market = service(dir.path().join("data").as_path());
        let installed = market
            .install_dir(
                &source,
                InstallSource::Development,
                &InstallOptions::default(),
                7,
            )
            .unwrap();

        assert_eq!(installed.manifest.version, "1.2.3");
        assert!(installed.dir.join("package/index.html").is_file());
        assert_eq!(
            market.list()[0].source,
            InstallSource::Development,
            "development installs are tagged so the UI can show them"
        );

        // Reinstalling picks up edited files.
        std::fs::write(source.join("package/index.html"), b"<html>v2</html>").unwrap();
        market
            .install_dir(
                &source,
                InstallSource::Development,
                &InstallOptions::default(),
                8,
            )
            .unwrap();
        let contents = std::fs::read_to_string(installed.dir.join("package/index.html")).unwrap();
        assert_eq!(contents, "<html>v2</html>");
    }

    #[test]
    fn signed_package_installs_and_tampering_is_rejected() {
        use ed25519_dalek::{Signer, SigningKey};

        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let zip = plugin_zip(&sample_manifest("1.0.0"));

        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        let public_key = crate::signing::encode_base64(signing_key.verifying_key().as_bytes());
        let signature = crate::signing::encode_base64(&signing_key.sign(&zip).to_bytes());

        let bad = InstallOptions::new().with_signature(
            public_key.clone(),
            crate::signing::encode_base64(&signing_key.sign(b"other").to_bytes()),
        );
        let err = market
            .install_zip(&zip, InstallSource::Development, &bad, 1)
            .unwrap_err();
        assert_eq!(err.code(), "signature_invalid");
        assert!(market.list().is_empty());

        let good = InstallOptions::new().with_signature(public_key, signature);
        market
            .install_zip(&zip, InstallSource::Development, &good, 1)
            .unwrap();
        assert_eq!(market.list().len(), 1);
    }

    #[test]
    fn uninstall_removes_files_and_state() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let installed = market
            .install_zip(
                &plugin_zip(&sample_manifest("1.0.0")),
                InstallSource::Development,
                &InstallOptions::default(),
                1,
            )
            .unwrap();
        let plugin_dir = installed.dir.clone();
        market.uninstall(&installed.manifest.id).unwrap();
        assert!(!plugin_dir.exists());
        assert!(market.list().is_empty());
        assert_eq!(
            market.uninstall(&installed.manifest.id).unwrap_err().code(),
            "not_found"
        );
    }

    #[test]
    fn zip_slip_is_rejected_without_writing_outside() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let evil = crate::fixtures::zip_with("../../escaped.txt", b"pwned");
        let err = market
            .install_zip(
                &evil,
                InstallSource::Development,
                &InstallOptions::default(),
                1,
            )
            .unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
        assert!(!dir.path().parent().unwrap().join("escaped.txt").exists());
        assert!(market.list().is_empty());
    }

    #[test]
    fn package_without_manifest_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let zip = crate::fixtures::zip_with("package/index.html", b"<html></html>");
        let err = market
            .install_zip(
                &zip,
                InstallSource::Development,
                &InstallOptions::default(),
                1,
            )
            .unwrap_err();
        assert_eq!(err.code(), "invalid_manifest");
    }

    #[test]
    fn package_without_entry_file_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let zip = crate::fixtures::zip_files(&[(
            "manifest.json",
            sample_manifest("1.0.0").to_string().as_bytes(),
        )]);
        let err = market
            .install_zip(
                &zip,
                InstallSource::Development,
                &InstallOptions::default(),
                1,
            )
            .unwrap_err();
        assert_eq!(err.code(), "invalid_manifest");
    }

    #[test]
    fn reconcile_drops_records_with_missing_directories() {
        let dir = tempfile::tempdir().unwrap();
        let mut market = service(dir.path());
        let installed = market
            .install_zip(
                &plugin_zip(&sample_manifest("1.0.0")),
                InstallSource::Development,
                &InstallOptions::default(),
                1,
            )
            .unwrap();
        std::fs::remove_dir_all(&installed.dir).unwrap();
        assert!(market.reconcile());
        assert!(market.list().is_empty());
    }
}
