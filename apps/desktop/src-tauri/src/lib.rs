//! DevDeck desktop host.
//!
//! Layering (outermost first):
//!
//! * [`commands`] — the only surface the renderer can reach.
//! * [`sdk`] — one gated dispatcher for every plugin capability.
//! * [`protocol`] — serves installed plugin assets over `plugin://`.
//! * `devdeck-capability` / `devdeck-market` / `devdeck-contract` —
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
mod service;
mod settings;
mod socket;
mod ssh;
mod state;
mod storage;
mod traceroute;
mod ws_server;

use std::path::Path;
use std::sync::Arc;

use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

/// Bundle identifier used before the DevDeck rename. Existing installs keep
/// settings and plugins there; copy it once into the new identifier's folder.
const LEGACY_BUNDLE_IDENTIFIER: &str = "com.devtoolbox.app";

fn copy_tree(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let target = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_tree(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

fn migrate_legacy_data_dir(platform_data: &Path, data_dir: &Path) {
    if data_dir.exists() {
        return;
    }
    let legacy = platform_data.join(LEGACY_BUNDLE_IDENTIFIER);
    if !legacy.is_dir() {
        return;
    }
    match copy_tree(&legacy, data_dir) {
        Ok(()) => eprintln!("migrated legacy DevDeck data from {}", legacy.display()),
        Err(error) => eprintln!("legacy data migration failed: {error}"),
    }
}

fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

pub(crate) fn sync_tray(app: &tauri::AppHandle, enabled: bool) {
    if !enabled {
        let _ = app.remove_tray_by_id("main-tray");
        return;
    }
    if app.tray_by_id("main-tray").is_some() {
        return;
    }
    let show = MenuItemBuilder::with_id("tray:show", "Show DevDeck").build(app);
    let quit = MenuItemBuilder::with_id("tray:quit", "Quit DevDeck").build(app);
    let (Ok(show), Ok(quit)) = (show, quit) else {
        return;
    };
    let menu = MenuBuilder::new(app).items(&[&show, &quit]).build();
    let Ok(menu) = menu else { return };
    let Some(icon) = app.default_window_icon().cloned() else {
        return;
    };
    let _ = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("DevDeck")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray:show" => show_main(app),
            "tray:quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app);
}

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
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            let (channel, payload) = match id {
                "theme:dark" => ("menu:theme", "dark"),
                "theme:light" => ("menu:theme", "light"),
                "language:en" => ("menu:language", "en"),
                "language:zh-CN" => ("menu:language", "zh-CN"),
                "help:about" => ("menu:action", "about"),
                other => ("menu:action", other),
            };
            let _ = app.emit(channel, payload);
        })
        .setup(|app| {
            // Native application menu. Accelerators mirror the legacy Electron menu.
            let about = MenuItemBuilder::with_id("about", "About DevDeck").build(app)?;
            let settings = MenuItemBuilder::with_id("settings", "Settings…")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;
            let quit = PredefinedMenuItem::quit(app, Some("Quit DevDeck"))?;
            let app_menu = SubmenuBuilder::new(app, "DevDeck")
                .item(&about)
                .item(&settings)
                .separator()
                .item(&quit)
                .build()?;

            let edit = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let theme_dark = MenuItemBuilder::with_id("theme:dark", "Dark").build(app)?;
            let theme_light = MenuItemBuilder::with_id("theme:light", "Light").build(app)?;
            let theme_menu = SubmenuBuilder::new(app, "Theme")
                .item(&theme_dark)
                .item(&theme_light)
                .build()?;

            let lang_en = MenuItemBuilder::with_id("language:en", "English").build(app)?;
            let lang_zh = MenuItemBuilder::with_id("language:zh-CN", "简体中文").build(app)?;
            let lang_menu = SubmenuBuilder::new(app, "Language")
                .item(&lang_en)
                .item(&lang_zh)
                .build()?;

            let view = SubmenuBuilder::new(app, "View")
                .item(&theme_menu)
                .item(&lang_menu)
                .build()?;

            let help_about = MenuItemBuilder::with_id("help:about", "About DevDeck").build(app)?;
            let help = SubmenuBuilder::new(app, "Help").item(&help_about).build()?;

            let menu = MenuBuilder::new(app)
                .items(&[&app_menu, &edit, &view, &help])
                .build()?;
            app.set_menu(menu)?;

            let data_dir = app.path().app_data_dir()?;
            if let Ok(platform_data) = app.path().data_dir() {
                migrate_legacy_data_dir(&platform_data, &data_dir);
            }
            let handle = app.handle().clone();
            let emit: socket::EventSink = Arc::new(move |payload| {
                let _ = handle.emit("plugin-socket", payload);
            });
            let tool_handle = app.handle().clone();
            let tool_emit: socket::EventSink = Arc::new(move |payload| {
                let _ = tool_handle.emit("tool-mqtt", payload);
            });
            let state = state::AppState::new(data_dir, emit, tool_emit)?;
            let desktop = state.desktop_settings();
            let tray_enabled = desktop.tray_enabled;
            app.manage(state);
            let ws_handle = app.handle().clone();
            let ws_emit: ws_server::EventSink = Arc::new(move |payload| {
                let _ = ws_handle.emit("ws-server", payload);
            });
            app.manage(ws_server::WsServerManager::new(ws_emit));

            let service = service::ServiceManager::new();
            if let Err(error) = service.start(
                desktop.service_port,
                desktop.service_auto_port,
                env!("CARGO_PKG_VERSION"),
            ) {
                eprintln!("local service did not start: {error}");
            }
            app.manage(service);
            sync_tray(app.handle(), tray_enabled);
            Ok(())
        })
        .on_window_event(|window, event| {
            let WindowEvent::CloseRequested { api, .. } = event else {
                return;
            };
            let behavior = window
                .app_handle()
                .state::<state::AppState>()
                .desktop_settings()
                .close_behavior;
            match behavior.as_str() {
                "tray" => {
                    api.prevent_close();
                    let _ = window.hide();
                }
                "ask" => {
                    api.prevent_close();
                    let close_window = window.clone();
                    window
                        .dialog()
                        .message("Minimize DevDeck to the tray, or quit the app?")
                        .title("Close DevDeck")
                        .buttons(MessageDialogButtons::OkCancelCustom(
                            "Minimize to tray".to_string(),
                            "Quit".to_string(),
                        ))
                        .show(move |minimize| {
                            if minimize {
                                let _ = close_window.hide();
                            } else {
                                close_window.app_handle().exit(0);
                            }
                        });
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::plugin_list,
            commands::plugin_uninstall,
            commands::plugin_set_enabled,
            commands::cert_generate_key,
            commands::cert_generate_ca,
            commands::cert_generate_csr,
            commands::cert_issue,
            commands::cert_parse,
            commands::system_ping,
            commands::tcp_ping,
            commands::mqtt_connect,
            commands::mqtt_subscribe,
            commands::mqtt_publish,
            commands::mqtt_disconnect,
            commands::traceroute,
            commands::ws_server_start,
            commands::ws_server_stop,
            commands::ws_server_status,
            commands::ws_server_send,
            commands::ws_server_kick,
            commands::ws_server_stress_start,
            commands::ws_server_stress_stop,
            commands::registry_list_sources,
            commands::registry_add_source,
            commands::registry_remove_source,
            commands::registry_refresh,
            commands::plugin_install_from_registry,
            commands::theme_set,
            commands::language_set,
            commands::text_size_set,
            commands::desktop_settings_get,
            commands::desktop_settings_set,
            commands::service_status,
            commands::service_check,
            commands::plugin_sdk_call,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run DevDeck");
}
