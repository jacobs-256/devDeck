//! DevToolBox desktop host.
//!
//! Layering (outermost first):
//!
//! * [`commands`] — the only surface the renderer can reach.
//! * [`sdk`] — one gated dispatcher for every plugin capability.
//! * [`protocol`] — serves installed plugin assets over `plugin://`.
//! * `devtoolbox-capability` / `devtoolbox-market` / `devtoolbox-contract` —
//!   framework-free crates that hold the actual policy and state.

mod certs;
mod commands;
mod files;
mod http;
mod logs;
mod mqtt;
mod ping;
mod protocol;
mod registry;
mod sdk;
mod settings;
mod socket;
mod ssh;
mod state;
mod storage;
mod traceroute;

use std::sync::Arc;

use tauri::{Emitter, Manager};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .register_uri_scheme_protocol("plugin", |ctx, request| {
            protocol::serve(ctx.app_handle(), request)
        })
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let handle = app.handle().clone();
            let emit: socket::EventSink = Arc::new(move |payload| {
                let _ = handle.emit("plugin-socket", payload);
            });
            let tool_handle = app.handle().clone();
            let tool_emit: socket::EventSink = Arc::new(move |payload| {
                let _ = tool_handle.emit("tool-mqtt", payload);
            });
            app.manage(state::AppState::new(data_dir, emit, tool_emit)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::plugin_list,
            commands::plugin_install_zip,
            commands::plugin_install_file,
            commands::plugin_install_folder,
            commands::plugin_uninstall,
            commands::plugin_set_enabled,
            commands::plugin_capabilities,
            commands::cert_generate_key,
            commands::cert_generate_ca,
            commands::cert_generate_csr,
            commands::cert_issue,
            commands::cert_parse,
            commands::tcp_ping,
            commands::mqtt_connect,
            commands::mqtt_subscribe,
            commands::mqtt_publish,
            commands::mqtt_disconnect,
            commands::mqtt_list,
            commands::traceroute,
            commands::registry_validate,
            commands::registry_list_sources,
            commands::registry_cache_status,
            commands::registry_add_source,
            commands::registry_remove_source,
            commands::registry_refresh,
            commands::plugin_install_from_registry,
            commands::theme_set,
            commands::language_set,
            commands::diagnostics,
            commands::plugin_sdk_call,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run DevToolBox");
}
