//! Tauri commands exposed to the DevToolBox renderer.
//!
//! Commands are intentionally coarse: plugin capabilities all go through
//! `plugin_sdk_call`, and the remaining commands are plain host management
//! (list/install/enable/disable/uninstall/inspect).

use devtoolbox_contract::{DevToolboxError, EntryStatus};
use devtoolbox_market::{InstalledPlugin, RegistrySource, SourceStore};
use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::certs::{
    self, CertificateInfo, CertificateMaterial, CsrMaterial, KeyAlgorithm, KeyMaterial,
    SubjectInput,
};
use crate::mqtt::validate_broker;
use crate::ping::{self, PingReport};
use crate::registry::{self, Catalog};
use crate::state::{now_ms, AppState};
use crate::traceroute::{self, TraceReport};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub platform: String,
    pub arch: String,
    pub data_dir: String,
    pub theme: String,
    pub language: String,
}

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<'_, AppState>) -> AppInfo {
    let package = app.package_info();
    AppInfo {
        name: package.name.clone(),
        version: package.version.to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        data_dir: state.root().display().to_string(),
        theme: state.theme(),
        language: state.language(),
    }
}

#[tauri::command]
pub fn plugin_list(state: State<'_, AppState>) -> Result<Vec<InstalledPlugin>, DevToolboxError> {
    Ok(state.market()?.list())
}

#[tauri::command]
pub fn plugin_uninstall(
    state: State<'_, AppState>,
    plugin_id: String,
) -> Result<(), DevToolboxError> {
    let id = state.parse_plugin_id(&plugin_id)?;
    state.market()?.uninstall(&id)?;
    state.broker_mut()?.revoke(&id);
    state.sockets().close_all(&id);
    state.ssh().close_all(&id);
    state.files().revoke_plugin(&id);
    Ok(())
}

#[tauri::command]
pub fn plugin_set_enabled(
    state: State<'_, AppState>,
    plugin_id: String,
    enabled: bool,
) -> Result<InstalledPlugin, DevToolboxError> {
    let id = state.parse_plugin_id(&plugin_id)?;
    let plugin = state.market()?.set_enabled(&id, enabled)?;
    let mut broker = state.broker_mut()?;
    if enabled {
        let _ = broker.grant_manifest(&plugin.manifest, now_ms());
    } else {
        broker.revoke(&id);
        drop(broker);
        // A disabled plugin loses its sockets, SSH sessions, and file grants.
        state.sockets().close_all(&id);
        state.ssh().close_all(&id);
        state.files().revoke_plugin(&id);
    }
    Ok(plugin)
}

#[tauri::command]
pub fn theme_set(state: State<'_, AppState>, theme: String) -> Result<(), DevToolboxError> {
    state.set_theme(&theme)
}

#[tauri::command]
pub fn language_set(state: State<'_, AppState>, language: String) -> Result<(), DevToolboxError> {
    state.set_language(&language)
}

#[tauri::command]
pub async fn mqtt_connect(
    state: State<'_, AppState>,
    broker: String,
    client_id: Option<String>,
    username: Option<String>,
    password: Option<String>,
    keep_alive: Option<u16>,
) -> Result<String, DevToolboxError> {
    // Validate first so malformed URLs fail even before any network activity.
    validate_broker(&broker)?;
    state
        .mqtt()
        .connect(
            &broker,
            client_id.as_deref().unwrap_or_default(),
            username.as_deref(),
            password.as_deref(),
            keep_alive.unwrap_or(60),
        )
        .await
}

#[tauri::command]
pub async fn mqtt_subscribe(
    state: State<'_, AppState>,
    session_id: String,
    topic: String,
    qos: Option<u8>,
) -> Result<(), DevToolboxError> {
    state.mqtt().subscribe(&session_id, &topic, qos).await
}

#[tauri::command]
pub async fn mqtt_publish(
    state: State<'_, AppState>,
    session_id: String,
    topic: String,
    payload: String,
    qos: Option<u8>,
    retain: Option<bool>,
) -> Result<(), DevToolboxError> {
    state
        .mqtt()
        .publish(&session_id, &topic, &payload, qos, retain.unwrap_or(false))
        .await
}

#[tauri::command]
pub async fn mqtt_disconnect(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), DevToolboxError> {
    state.mqtt().disconnect(&session_id).await
}

#[tauri::command]
pub async fn traceroute(
    host: String,
    max_hops: Option<u32>,
) -> Result<TraceReport, DevToolboxError> {
    traceroute::traceroute(&host, max_hops.unwrap_or(30)).await
}

#[tauri::command]
pub async fn tcp_ping(
    host: String,
    port: u16,
    count: Option<u32>,
    timeout_ms: Option<u64>,
) -> Result<PingReport, DevToolboxError> {
    ping::tcp_ping(&host, port, count.unwrap_or(4), timeout_ms.unwrap_or(2000)).await
}

#[tauri::command]
pub fn cert_generate_key(algorithm: Option<KeyAlgorithm>) -> Result<KeyMaterial, DevToolboxError> {
    certs::generate_key_pair(algorithm.unwrap_or_default())
}

#[tauri::command]
pub fn cert_generate_ca(
    subject: SubjectInput,
    days: Option<u32>,
    algorithm: Option<KeyAlgorithm>,
) -> Result<CertificateMaterial, DevToolboxError> {
    certs::generate_ca(&subject, days.unwrap_or(365), algorithm.unwrap_or_default())
}

#[tauri::command]
pub fn cert_generate_csr(
    subject: SubjectInput,
    algorithm: Option<KeyAlgorithm>,
) -> Result<CsrMaterial, DevToolboxError> {
    certs::generate_csr(&subject, algorithm.unwrap_or_default())
}

#[tauri::command]
pub fn cert_issue(
    ca_certificate_pem: String,
    ca_private_key_pem: String,
    csr_pem: String,
    days: Option<u32>,
    client_auth: Option<bool>,
) -> Result<String, DevToolboxError> {
    certs::issue_certificate(
        &ca_certificate_pem,
        &ca_private_key_pem,
        &csr_pem,
        days.unwrap_or(365),
        client_auth.unwrap_or(true),
    )
}

#[tauri::command]
pub fn cert_parse(pem: String) -> Result<CertificateInfo, DevToolboxError> {
    certs::parse_certificate(&pem)
}

#[tauri::command]
pub fn registry_list_sources(
    state: State<'_, AppState>,
) -> Result<Vec<RegistrySource>, DevToolboxError> {
    Ok(state.sources()?.list())
}

#[tauri::command]
pub fn registry_add_source(
    state: State<'_, AppState>,
    url: String,
    name: Option<String>,
    public_key: Option<String>,
    require_signature: Option<bool>,
) -> Result<RegistrySource, DevToolboxError> {
    let mut store: std::sync::MutexGuard<'_, SourceStore> = state.sources()?;
    store.add(
        name.as_deref(),
        &url,
        public_key.as_deref(),
        require_signature.unwrap_or(false),
        now_ms(),
    )
}

#[tauri::command]
pub fn registry_remove_source(
    state: State<'_, AppState>,
    source_id: String,
) -> Result<(), DevToolboxError> {
    state.sources()?.remove(&source_id)?;
    state.evict_registry(&source_id);
    Ok(())
}

/// Refresh one source (or all of them) and return the merged catalog.
///
/// A failing source does not fail the whole refresh: its error is reported in
/// `catalog.errors` so the UI can keep showing the remaining sources.
#[tauri::command]
pub async fn registry_refresh(
    state: State<'_, AppState>,
    source_id: Option<String>,
) -> Result<Catalog, DevToolboxError> {
    let sources = {
        let store = state.sources()?;
        match &source_id {
            Some(id) => vec![store.get(id).ok_or_else(|| {
                DevToolboxError::NotFound(format!("registry source '{id}' is not configured"))
            })?],
            None => store.list(),
        }
    };

    let mut catalog = Catalog::default();
    for source in sources {
        match registry::fetch_registry(&source).await {
            Ok(index) => {
                for entry in index
                    .plugins
                    .iter()
                    .filter(|entry| entry.status == EntryStatus::Active)
                {
                    catalog
                        .entries
                        .push(registry::catalog_entry(&source, entry));
                }
                state.cache_registry(&source.id, index);
            }
            Err(err) => catalog.errors.push(registry::SourceError {
                source_id: source.id.clone(),
                source_name: source.name.clone(),
                message: err.to_string(),
            }),
        }
    }

    catalog.entries = registry::merge_catalog(std::mem::take(&mut catalog.entries));
    Ok(catalog)
}

/// Download, verify, and install a plugin from a configured registry.
#[tauri::command]
pub async fn plugin_install_from_registry(
    state: State<'_, AppState>,
    source_id: String,
    plugin_id: String,
    version: Option<String>,
) -> Result<InstalledPlugin, DevToolboxError> {
    let id = state.parse_plugin_id(&plugin_id)?;
    registry::install_from_registry(state.inner(), &source_id, &id, version.as_deref()).await
}

#[tauri::command]
pub async fn plugin_sdk_call(
    app: AppHandle,
    state: State<'_, AppState>,
    plugin_id: String,
    method: String,
    params: Option<Value>,
) -> Result<Value, DevToolboxError> {
    let id = state.parse_plugin_id(&plugin_id)?;
    crate::sdk::dispatch(
        &app,
        state.inner(),
        &id,
        &method,
        params.unwrap_or(Value::Null),
    )
    .await
}
