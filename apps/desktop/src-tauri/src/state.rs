//! Shared application state: marketplace, capability grants, storage, theme.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use devdeck_capability::CapabilityBroker;
use devdeck_contract::{DevDeckError, PluginId, RegistryIndex};
use devdeck_market::{InstalledPlugin, MarketplaceService, SourceStore};

use crate::files::FileAccess;
use crate::mqtt::MqttManager;
use crate::settings::SettingsStore;
use crate::socket::{EventSink, SocketManager};
use crate::ssh::{KnownHosts, SshManager};
use crate::storage::PluginStorage;

/// Milliseconds since the Unix epoch.
pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Last successfully fetched registry, kept in memory for the session.
#[derive(Debug, Clone)]
pub struct CachedRegistry {
    pub index: RegistryIndex,
}

/// Process-wide application state managed by Tauri.
pub struct AppState {
    root: PathBuf,
    market: Mutex<MarketplaceService>,
    broker: RwLock<CapabilityBroker>,
    sources: Mutex<SourceStore>,
    registry_cache: Mutex<HashMap<String, CachedRegistry>>,
    storage: Arc<PluginStorage>,
    files: FileAccess,
    sockets: SocketManager,
    ssh: SshManager,
    mqtt: MqttManager,
    settings: Mutex<SettingsStore>,
}

impl AppState {
    /// Initialize state under the platform app-data directory.
    pub fn new(
        root: impl Into<PathBuf>,
        emit: EventSink,
        tool_emit: EventSink,
    ) -> Result<Self, DevDeckError> {
        let root = root.into();
        std::fs::create_dir_all(&root)?;

        let mut market = MarketplaceService::open(&root)?;
        if market.reconcile() {
            market.save()?;
        }

        let mut broker = CapabilityBroker::new();
        for plugin in market.list() {
            if plugin.enabled {
                // A corrupted legacy manifest must not brick startup: it simply
                // gets no capabilities until reinstalled.
                let _ = broker.grant_manifest(&plugin.manifest, now_ms());
            }
        }

        let storage = Arc::new(PluginStorage::new(root.join("plugin-data"))?);
        let files = FileAccess::new(root.join("plugin-data"))?;
        let sources = SourceStore::open(&root)?;
        let sockets = SocketManager::new(emit.clone());
        let known_hosts = KnownHosts::open(root.join("known-hosts.json"))?;
        let ssh = SshManager::new(known_hosts, emit);
        let mqtt = MqttManager::new(tool_emit);
        let settings = SettingsStore::open(&root)?;

        Ok(Self {
            root,
            market: Mutex::new(market),
            broker: RwLock::new(broker),
            sources: Mutex::new(sources),
            registry_cache: Mutex::new(HashMap::new()),
            storage,
            files,
            sockets,
            ssh,
            mqtt,
            settings: Mutex::new(settings),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn market(&self) -> Result<std::sync::MutexGuard<'_, MarketplaceService>, DevDeckError> {
        self.market
            .lock()
            .map_err(|_| DevDeckError::Internal("marketplace lock poisoned".to_string()))
    }

    pub fn broker(&self) -> Result<std::sync::RwLockReadGuard<'_, CapabilityBroker>, DevDeckError> {
        self.broker
            .read()
            .map_err(|_| DevDeckError::Internal("capability lock poisoned".to_string()))
    }

    pub fn broker_mut(
        &self,
    ) -> Result<std::sync::RwLockWriteGuard<'_, CapabilityBroker>, DevDeckError> {
        self.broker
            .write()
            .map_err(|_| DevDeckError::Internal("capability lock poisoned".to_string()))
    }

    pub fn sources(&self) -> Result<std::sync::MutexGuard<'_, SourceStore>, DevDeckError> {
        self.sources
            .lock()
            .map_err(|_| DevDeckError::Internal("registry sources lock poisoned".to_string()))
    }

    /// Remember a freshly fetched registry for this session.
    pub fn cache_registry(&self, source_id: &str, index: RegistryIndex) {
        if let Ok(mut cache) = self.registry_cache.lock() {
            cache.insert(source_id.to_string(), CachedRegistry { index });
        }
    }

    pub fn cached_registry(&self, source_id: &str) -> Option<RegistryIndex> {
        self.registry_cache
            .lock()
            .ok()
            .and_then(|cache| cache.get(source_id).map(|cached| cached.index.clone()))
    }

    pub fn evict_registry(&self, source_id: &str) {
        if let Ok(mut cache) = self.registry_cache.lock() {
            cache.remove(source_id);
        }
    }

    /// Cloneable handle so storage work can move to the blocking thread pool.
    pub fn storage_handle(&self) -> Arc<PluginStorage> {
        Arc::clone(&self.storage)
    }

    pub fn files(&self) -> &FileAccess {
        &self.files
    }

    pub fn sockets(&self) -> &SocketManager {
        &self.sockets
    }

    pub fn ssh(&self) -> &SshManager {
        &self.ssh
    }

    pub fn mqtt(&self) -> &MqttManager {
        &self.mqtt
    }

    pub fn theme(&self) -> String {
        self.settings
            .lock()
            .map(|store| store.theme())
            .unwrap_or_else(|_| "auto".to_string())
    }

    pub fn language(&self) -> String {
        self.settings
            .lock()
            .map(|store| store.language())
            .unwrap_or_else(|_| "auto".to_string())
    }

    pub fn set_language(&self, language: &str) -> Result<(), DevDeckError> {
        self.settings
            .lock()
            .map_err(|_| DevDeckError::Internal("settings lock poisoned".to_string()))?
            .set_language(language)
    }

    pub fn set_theme(&self, theme: &str) -> Result<(), DevDeckError> {
        self.settings
            .lock()
            .map_err(|_| DevDeckError::Internal("settings lock poisoned".to_string()))?
            .set_theme(theme)
    }

    pub fn text_size(&self) -> String {
        self.settings
            .lock()
            .map(|store| store.text_size())
            .unwrap_or_else(|_| "default".to_string())
    }

    pub fn set_text_size(&self, size: &str) -> Result<(), DevDeckError> {
        self.settings
            .lock()
            .map_err(|_| DevDeckError::Internal("settings lock poisoned".to_string()))?
            .set_text_size(size)
    }

    pub fn desktop_settings(&self) -> crate::settings::DesktopSettings {
        self.settings.lock().map(|store| store.desktop()).unwrap_or(
            crate::settings::DesktopSettings {
                close_behavior: "ask".to_string(),
                tray_enabled: true,
                service_port: 8765,
                service_auto_port: true,
            },
        )
    }

    pub fn set_desktop_settings(
        &self,
        settings: &crate::settings::DesktopSettings,
    ) -> Result<(), DevDeckError> {
        self.settings
            .lock()
            .map_err(|_| DevDeckError::Internal("settings lock poisoned".to_string()))?
            .set_desktop(settings)
    }

    /// Parse a plugin id coming from the renderer.
    pub fn parse_plugin_id(&self, raw: &str) -> Result<PluginId, DevDeckError> {
        PluginId::new(raw)
    }

    /// Require that a plugin is installed and enabled before running any SDK
    /// method on its behalf.
    pub fn require_active(&self, id: &PluginId) -> Result<InstalledPlugin, DevDeckError> {
        let market = self.market()?;
        let plugin = market
            .get(id)
            .ok_or_else(|| DevDeckError::NotFound(format!("plugin '{id}' is not installed")))?;
        if !plugin.enabled {
            return Err(DevDeckError::denied(format!("plugin '{id}' is disabled")));
        }
        Ok(plugin)
    }

    /// Recompute grants for every installed plugin.
    pub fn rebuild_grants(&self) -> Result<(), DevDeckError> {
        let plugins = self.market()?.list();
        let mut broker = self.broker_mut()?;
        for plugin in plugins {
            broker.revoke(&plugin.manifest.id);
            if plugin.enabled {
                let _ = broker.grant_manifest(&plugin.manifest, now_ms());
            }
        }
        Ok(())
    }
}
