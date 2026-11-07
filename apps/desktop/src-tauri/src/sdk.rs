//! The plugin SDK dispatcher.
//!
//! Every plugin capability call arrives here through one generic, gated entry
//! point (`plugin_sdk_call`). Adding a capability means adding a method here
//! and a permission to the contract — never a new Tauri command per feature.
//! That keeps the host surface small and the permission model auditable.

use devtoolbox_contract::{DevToolboxError, Permission, PluginId};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use tauri_plugin_dialog::DialogExt;

use crate::socket;
use crate::state::AppState;
use crate::{http, logs};

/// Dispatch one SDK method for `plugin_id`.
pub async fn dispatch(
    app: &AppHandle,
    state: &AppState,
    plugin_id: &PluginId,
    method: &str,
    params: Value,
) -> Result<Value, DevToolboxError> {
    // A disabled or uninstalled plugin cannot call anything.
    let plugin = state.require_active(plugin_id)?;
    // SDK 1.x plugins expect the legacy response shapes (`storage.get` returned
    // the raw value, `log.info` was its own method). Keep them working.
    let legacy = uses_legacy_sdk(&plugin.manifest.sdk_version);

    match method {
        // Introspection is always allowed: the plugin needs to know what it was
        // granted in order to degrade gracefully.
        "capability.list" => {
            let broker = state.broker()?;
            let summary = broker.summary(plugin_id);
            Ok(json!({ "grant": summary }))
        }

        "storage.get" => {
            require(state, plugin_id, Permission::StorageKv)?;
            let key = string_param(&params, "key")?;
            let value = state.storage().get(plugin_id, key)?;
            Ok(storage_get_response(value, legacy))
        }
        "storage.set" => {
            require(state, plugin_id, Permission::StorageKv)?;
            let key = string_param(&params, "key")?;
            let value = params
                .get("value")
                .cloned()
                .ok_or_else(|| DevToolboxError::InvalidArgument("missing 'value'".to_string()))?;
            state.storage().set(plugin_id, key, value)?;
            Ok(json!({ "saved": true }))
        }
        "storage.delete" => {
            require(state, plugin_id, Permission::StorageKv)?;
            let key = string_param(&params, "key")?;
            let deleted = state.storage().delete(plugin_id, key)?;
            Ok(json!({ "deleted": deleted }))
        }
        "storage.keys" | "storage.list" => {
            require(state, plugin_id, Permission::StorageKv)?;
            let prefix = params.get("prefix").and_then(Value::as_str).unwrap_or("");
            let keys: Vec<String> = state
                .storage()
                .keys(plugin_id)?
                .into_iter()
                .filter(|key| key.starts_with(prefix))
                .collect();
            Ok(storage_keys_response(keys, legacy))
        }
        "storage.clear" => {
            require(state, plugin_id, Permission::StorageKv)?;
            state.storage().clear(plugin_id)?;
            Ok(json!({ "cleared": true }))
        }

        "log.write" | "log.debug" | "log.info" | "log.warn" | "log.error" | "log.log" => {
            require(state, plugin_id, Permission::LogWrite)?;
            let level = log_level(method, &params);
            let message = string_param(&params, "message")?;
            let data = params.get("data");
            logs::write_plugin_log(state.root(), plugin_id, level, message, data)?;
            Ok(json!({ "logged": true }))
        }

        "http.request" => {
            let request: http::HttpRequestParams =
                serde_json::from_value(params).map_err(|err| {
                    DevToolboxError::InvalidArgument(format!("invalid http.request params: {err}"))
                })?;
            let response = http::execute(state, plugin_id, request).await?;
            serde_json::to_value(response).map_err(DevToolboxError::from)
        }

        // ---- SSH / SFTP (`net:ssh`) ----
        "ssh.connect" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let params: crate::ssh::ConnectParams = serde_json::from_value(params.clone())
                .map_err(|err| {
                    DevToolboxError::InvalidArgument(format!("invalid ssh.connect params: {err}"))
                })?;
            let terminal_id = params.terminal_id.clone();
            let cols = params.cols.unwrap_or(120);
            let rows = params.rows.unwrap_or(32);
            let result = state.ssh().connect(plugin_id, params).await?;
            let mut payload = serde_json::to_value(&result)?;
            if let Some(terminal_id) = terminal_id {
                let channel_id = state
                    .ssh()
                    .open_shell(
                        plugin_id,
                        &result.session_id,
                        cols,
                        rows,
                        "xterm-256color",
                        Some(&terminal_id),
                    )
                    .await?;
                payload["terminalId"] = json!(terminal_id);
                payload["channelId"] = json!(channel_id);
            }
            Ok(payload)
        }
        "ssh.openShell" | "ssh.openTerminal" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let cols = u32_param(&params, "cols", 120)?;
            let rows = u32_param(&params, "rows", 32)?;
            let term = optional_string(&params, "term").unwrap_or("xterm-256color");
            let channel_id = state
                .ssh()
                .open_shell(
                    plugin_id,
                    session_id,
                    cols,
                    rows,
                    term,
                    optional_string(&params, "channelId"),
                )
                .await?;
            Ok(json!({ "sessionId": session_id, "channelId": channel_id }))
        }
        "ssh.exec" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let command = string_param(&params, "command")?;
            let channel_id = state
                .ssh()
                .exec(
                    plugin_id,
                    session_id,
                    command,
                    optional_string(&params, "channelId"),
                )
                .await?;
            Ok(json!({ "sessionId": session_id, "channelId": channel_id }))
        }
        "ssh.write" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let channel_id = ssh_channel_param(&params)?;
            let bytes = data_param(&params)?;
            state
                .ssh()
                .write(plugin_id, session_id, &channel_id, bytes)?;
            Ok(json!({ "written": true }))
        }
        "ssh.resize" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let channel_id = ssh_channel_param(&params)?;
            let cols = u32_param(&params, "cols", 120)?;
            let rows = u32_param(&params, "rows", 32)?;
            state
                .ssh()
                .resize(plugin_id, session_id, &channel_id, cols, rows)?;
            Ok(json!({ "resized": true }))
        }
        "ssh.closeTerminal" | "ssh.closeChannel" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let channel_id = ssh_channel_param(&params)?;
            state
                .ssh()
                .close_channel(plugin_id, session_id, &channel_id)?;
            Ok(json!({ "closed": true }))
        }
        "ssh.disconnect" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            state.ssh().disconnect(plugin_id, session_id).await?;
            Ok(json!({ "disconnected": true }))
        }
        "ssh.listSessions" | "ssh.list" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let sessions = state.ssh().list(plugin_id);
            Ok(json!({ "sessions": sessions, "items": sessions }))
        }
        "ssh.forgetHost" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let host = string_param(&params, "host")?;
            let port = port_param(&params, "port").unwrap_or(22);
            let removed = state.ssh().forget_host(host, port)?;
            Ok(json!({ "removed": removed }))
        }
        "ssh.respondKeyboard" => Err(DevToolboxError::Unsupported(
            "keyboard-interactive authentication is not supported; use a password or key"
                .to_string(),
        )),

        "ssh.sftpList" | "sftp.list" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let path = optional_string(&params, "path").unwrap_or(".");
            let entries = state.ssh().sftp_list(plugin_id, session_id, path).await?;
            Ok(json!({ "items": entries, "entries": entries }))
        }
        "ssh.sftpReadFile" | "sftp.read" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let path = string_param(&params, "path")?;
            let file = state
                .ssh()
                .sftp_read(
                    plugin_id,
                    session_id,
                    path,
                    optional_string(&params, "encoding"),
                )
                .await?;
            Ok(serde_json::to_value(file)?)
        }
        "ssh.sftpWriteFile" | "sftp.write" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let path = string_param(&params, "path")?;
            let content = text_param(&params, "content")?;
            let written = state
                .ssh()
                .sftp_write(
                    plugin_id,
                    session_id,
                    path,
                    content,
                    optional_string(&params, "encoding"),
                )
                .await?;
            Ok(json!({ "written": written }))
        }
        "ssh.sftpMkdir" | "sftp.mkdir" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let path = string_param(&params, "path")?;
            state.ssh().sftp_mkdir(plugin_id, session_id, path).await?;
            Ok(json!({ "ok": true }))
        }
        "ssh.sftpDelete" | "sftp.remove" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let path = string_param(&params, "path")?;
            let directory = params
                .get("directory")
                .or_else(|| params.get("isDir"))
                .and_then(Value::as_bool)
                .unwrap_or(false);
            state
                .ssh()
                .sftp_remove(plugin_id, session_id, path, directory)
                .await?;
            Ok(json!({ "ok": true }))
        }
        "ssh.sftpRename" | "sftp.rename" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let from = optional_string(&params, "from")
                .or_else(|| optional_string(&params, "oldPath"))
                .ok_or_else(|| DevToolboxError::InvalidArgument("missing 'from'".to_string()))?;
            let to = optional_string(&params, "to")
                .or_else(|| optional_string(&params, "newPath"))
                .ok_or_else(|| DevToolboxError::InvalidArgument("missing 'to'".to_string()))?;
            state
                .ssh()
                .sftp_rename(plugin_id, session_id, from, to)
                .await?;
            Ok(json!({ "ok": true }))
        }
        "ssh.sftpRealpath" | "sftp.realpath" => {
            require(state, plugin_id, Permission::NetSsh)?;
            let session_id = string_param(&params, "sessionId")?;
            let path = string_param(&params, "path")?;
            let resolved = state
                .ssh()
                .sftp_realpath(plugin_id, session_id, path)
                .await?;
            Ok(json!({ "path": resolved }))
        }

        // ---- Files (`fs:*`) ----
        // `pickFile`/`pickSaveFile` are the v2 names; `openFileDialog` and
        // `saveFileDialog` are the SDK 1.x aliases (same response shape).
        "fs.pickFile" | "fs.openFileDialog" => {
            require(state, plugin_id, Permission::FsDialog)?;
            let paths = pick_paths(app, &params, false).await?;
            let mut items = Vec::with_capacity(paths.len());
            for path in paths {
                items.push(state.files().grant(plugin_id, &path, false)?);
            }
            Ok(json!({ "items": items }))
        }
        "fs.pickSaveFile" | "fs.saveFileDialog" => {
            require(state, plugin_id, Permission::FsDialog)?;
            let paths = pick_paths(app, &params, true).await?;
            match paths.into_iter().next() {
                Some(path) => Ok(serde_json::to_value(
                    state.files().grant(plugin_id, &path, true)?,
                )?),
                None => Ok(Value::Null),
            }
        }
        "fs.readFile" => {
            require(state, plugin_id, Permission::FsRead)?;
            let file_token = token_param(&params)?;
            let contents = state.files().read_token(
                plugin_id,
                file_token,
                optional_string(&params, "encoding"),
            )?;
            serde_json::to_value(contents).map_err(DevToolboxError::from)
        }
        "fs.writeFile" => {
            require(state, plugin_id, Permission::FsWrite)?;
            let file_token = token_param(&params)?;
            let content = text_param(&params, "content")?;
            let written = state.files().write_token(
                plugin_id,
                file_token,
                content,
                optional_string(&params, "encoding"),
            )?;
            Ok(json!({ "written": written }))
        }
        "fs.readPluginData" => {
            require(state, plugin_id, Permission::FsPluginData)?;
            let path = string_param(&params, "path")?;
            let contents =
                state
                    .files()
                    .read_data(plugin_id, path, optional_string(&params, "encoding"))?;
            serde_json::to_value(contents).map_err(DevToolboxError::from)
        }
        "fs.writePluginData" => {
            require(state, plugin_id, Permission::FsPluginData)?;
            let path = string_param(&params, "path")?;
            let content = text_param(&params, "content")?;
            let written = state.files().write_data(
                plugin_id,
                path,
                content,
                optional_string(&params, "encoding"),
            )?;
            Ok(json!({ "written": written }))
        }

        // ---- Raw sockets (`net:socket`) ----
        // Method names follow the v2 SDK; the `client*`/`server*` aliases keep
        // SDK 1.x plugins (TCP/UDP tester, MQTT bridges) working unchanged.
        "socket.tcpConnect" | "socket.clientConnect" => {
            require(state, plugin_id, Permission::NetSocket)?;
            let host = optional_string(&params, "host").unwrap_or("127.0.0.1");
            let port = port_param(&params, "port")?;
            let session_id = state.sockets().tcp_connect(plugin_id, host, port).await?;
            Ok(json!({ "sessionId": session_id }))
        }
        "socket.tcpSend" | "socket.clientSend" => {
            require(state, plugin_id, Permission::NetSocket)?;
            let session_id = session_param(state, plugin_id, &params)?;
            let bytes = data_param(&params)?;
            state.sockets().tcp_send(plugin_id, &session_id, bytes)?;
            Ok(json!({ "sent": true, "sessionId": session_id }))
        }
        "socket.tcpClose" => {
            require(state, plugin_id, Permission::NetSocket)?;
            let session_id = session_param(state, plugin_id, &params)?;
            state.sockets().close(plugin_id, &session_id)?;
            Ok(json!({ "closed": true }))
        }
        "socket.clientDisconnect" | "socket.serverStop" => {
            require(state, plugin_id, Permission::NetSocket)?;
            match optional_string(&params, "sessionId") {
                Some(session_id) => state.sockets().close(plugin_id, session_id)?,
                None => state.sockets().close_all(plugin_id),
            }
            Ok(json!({ "closed": true }))
        }
        "socket.tcpListen" | "socket.serverStart" => {
            require(state, plugin_id, Permission::NetSocket)?;
            let host = optional_string(&params, "host").unwrap_or("127.0.0.1");
            let port = port_param(&params, "port")?;
            let (session_id, bound_port) =
                state.sockets().tcp_listen(plugin_id, host, port).await?;
            Ok(json!({ "sessionId": session_id, "port": bound_port }))
        }
        "socket.serverSend" => {
            require(state, plugin_id, Permission::NetSocket)?;
            let session_id = session_param(state, plugin_id, &params)?;
            let client_id = string_param(&params, "clientId")?;
            let bytes = data_param(&params)?;
            state
                .sockets()
                .server_send(plugin_id, &session_id, client_id, bytes)?;
            Ok(json!({ "sent": true }))
        }
        "socket.serverKick" => {
            require(state, plugin_id, Permission::NetSocket)?;
            let session_id = session_param(state, plugin_id, &params)?;
            let client_id = string_param(&params, "clientId")?;
            state
                .sockets()
                .server_kick(plugin_id, &session_id, client_id)?;
            Ok(json!({ "kicked": true }))
        }
        "socket.udpBind" => {
            require(state, plugin_id, Permission::NetSocket)?;
            let host = optional_string(&params, "host").unwrap_or("127.0.0.1");
            let port = port_param(&params, "port")?;
            let (session_id, bound_port) = state.sockets().udp_bind(plugin_id, host, port).await?;
            Ok(json!({ "sessionId": session_id, "port": bound_port }))
        }
        "socket.udpSend" => {
            require(state, plugin_id, Permission::NetSocket)?;
            let session_id = session_param(state, plugin_id, &params)?;
            let host = string_param(&params, "host")?;
            let port = port_param(&params, "port")?;
            let bytes = data_param(&params)?;
            let sent = state
                .sockets()
                .udp_send(plugin_id, &session_id, host, port, bytes)
                .await?;
            Ok(json!({ "sent": sent }))
        }
        "socket.close" => {
            require(state, plugin_id, Permission::NetSocket)?;
            let session_id = session_param(state, plugin_id, &params)?;
            state.sockets().close(plugin_id, &session_id)?;
            Ok(json!({ "closed": true }))
        }
        "socket.list" | "socket.serverStatus" | "socket.clientStatus" => {
            require(state, plugin_id, Permission::NetSocket)?;
            Ok(json!({
                "sessions": state.sockets().sessions_of(plugin_id),
                "sessionIds": state.sockets().sessions_of(plugin_id),
            }))
        }

        "system.openExternal" => {
            require(state, plugin_id, Permission::SystemOpenExternal)?;
            let raw = string_param(&params, "url")?;
            let url = url::Url::parse(raw)
                .map_err(|err| DevToolboxError::InvalidArgument(format!("invalid URL: {err}")))?;
            if !matches!(url.scheme(), "http" | "https") {
                return Err(DevToolboxError::denied(
                    "only http(s) URLs may be opened externally",
                ));
            }
            if !url.username().is_empty() || url.password().is_some() {
                return Err(DevToolboxError::denied(
                    "URLs with embedded credentials are not allowed",
                ));
            }
            app.opener()
                .open_url(url.to_string(), None::<&str>)
                .map_err(|err| DevToolboxError::Internal(format!("failed to open URL: {err}")))?;
            Ok(json!({ "opened": true }))
        }

        "system.getEnv" => {
            let broker = state.broker()?;
            let names: Vec<String> = params
                .get("keys")
                .and_then(Value::as_array)
                .map(|keys| {
                    keys.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();
            if names.is_empty() {
                return Err(DevToolboxError::InvalidArgument(
                    "keys must be a non-empty array of environment variable names".to_string(),
                ));
            }
            let mut values = serde_json::Map::new();
            for name in names {
                broker.authorize_env(plugin_id, &name)?;
                if let Ok(value) = std::env::var(&name) {
                    values.insert(name, Value::String(value));
                }
            }
            Ok(Value::Object(values))
        }

        "system.getInfo" => {
            require(state, plugin_id, Permission::SystemGetInfo)?;
            Ok(json!({
                "platform": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
                "appVersion": app.package_info().version.to_string(),
                "tauriVersion": tauri::VERSION,
            }))
        }

        "theme.get" => {
            require(state, plugin_id, Permission::ThemeRead)?;
            Ok(json!({ "theme": state.theme() }))
        }

        other => Err(DevToolboxError::Unsupported(format!(
            "unknown SDK method '{other}'"
        ))),
    }
}

fn require(
    state: &AppState,
    plugin_id: &PluginId,
    permission: Permission,
) -> Result<(), DevToolboxError> {
    state.broker()?.require(plugin_id, permission)?;
    Ok(())
}

fn string_param<'a>(params: &'a Value, key: &str) -> Result<&'a str, DevToolboxError> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            DevToolboxError::InvalidArgument(format!("missing string parameter '{key}'"))
        })
}

/// SDK 1.x plugins keep working: unknown/failed versions are treated as legacy
/// so they never receive a newer response shape than they understand.
fn uses_legacy_sdk(sdk_version: &str) -> bool {
    sdk_version
        .trim()
        .split('.')
        .next()
        .and_then(|major| major.parse::<u32>().ok())
        .map(|major| major < 2)
        .unwrap_or(true)
}

fn storage_get_response(value: Option<Value>, legacy: bool) -> Value {
    if legacy {
        value.unwrap_or(Value::Null)
    } else {
        json!({ "value": value })
    }
}

fn storage_keys_response(keys: Vec<String>, legacy: bool) -> Value {
    if legacy {
        json!(keys)
    } else {
        json!({ "keys": keys })
    }
}

fn log_level<'a>(method: &'a str, params: &'a Value) -> &'a str {
    match method {
        "log.write" => params
            .get("level")
            .and_then(Value::as_str)
            .unwrap_or("info"),
        "log.log" => "info",
        other => other.strip_prefix("log.").unwrap_or("info"),
    }
}

fn optional_string<'a>(params: &'a Value, key: &str) -> Option<&'a str> {
    params
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}

fn port_param(params: &Value, key: &str) -> Result<u16, DevToolboxError> {
    let raw = params
        .get(key)
        .and_then(Value::as_u64)
        .ok_or_else(|| DevToolboxError::InvalidArgument(format!("missing numeric '{key}'")))?;
    u16::try_from(raw)
        .map_err(|_| DevToolboxError::InvalidArgument(format!("'{key}' must be 0-65535")))
}

fn data_param(params: &Value) -> Result<Vec<u8>, DevToolboxError> {
    let data = string_param(params, "data")?;
    socket::decode_payload(data, optional_string(params, "encoding"))
}

fn session_param(
    state: &AppState,
    plugin_id: &PluginId,
    params: &Value,
) -> Result<String, DevToolboxError> {
    if let Some(session_id) = optional_string(params, "sessionId") {
        return Ok(session_id.to_string());
    }
    state.sockets().only_session(plugin_id).ok_or_else(|| {
        DevToolboxError::InvalidArgument(
            "sessionId is required when the plugin has zero or multiple sessions".to_string(),
        )
    })
}

fn text_param<'a>(params: &'a Value, key: &str) -> Result<&'a str, DevToolboxError> {
    params.get(key).and_then(Value::as_str).ok_or_else(|| {
        DevToolboxError::InvalidArgument(format!("missing string parameter '{key}'"))
    })
}

/// Accept both the v2 `token` and the SDK 1.x `fileToken` parameter names.
fn token_param(params: &Value) -> Result<&str, DevToolboxError> {
    optional_string(params, "fileToken")
        .or_else(|| optional_string(params, "token"))
        .ok_or_else(|| DevToolboxError::InvalidArgument("missing 'fileToken'".to_string()))
}

struct DialogFilter {
    name: String,
    extensions: Vec<String>,
}

fn parse_filters(params: &Value) -> Vec<DialogFilter> {
    params
        .get("filters")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let name = item.get("name")?.as_str()?.to_string();
                    let extensions: Vec<String> = item
                        .get("extensions")?
                        .as_array()?
                        .iter()
                        .filter_map(Value::as_str)
                        .map(|extension| extension.trim().trim_start_matches('.').to_string())
                        .filter(|extension| !extension.is_empty())
                        .collect();
                    if extensions.is_empty() {
                        None
                    } else {
                        Some(DialogFilter { name, extensions })
                    }
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Show a native open/save dialog off the main thread.
async fn pick_paths(
    app: &AppHandle,
    params: &Value,
    save: bool,
) -> Result<Vec<std::path::PathBuf>, DevToolboxError> {
    let title = optional_string(params, "title")
        .unwrap_or(if save { "Save File" } else { "Open File" })
        .to_string();
    let suggested_name = optional_string(params, "suggestedName")
        .unwrap_or("output.txt")
        .to_string();
    let multiple = params
        .get("multiple")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let filters = parse_filters(params);
    let app = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app.dialog().file().set_title(title);
        for filter in filters {
            let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
            builder = builder.add_filter(filter.name, &extensions);
        }

        if save {
            builder
                .set_file_name(suggested_name)
                .blocking_save_file()
                .and_then(|file| file.into_path().ok())
                .into_iter()
                .collect::<Vec<_>>()
        } else if multiple {
            builder
                .blocking_pick_files()
                .unwrap_or_default()
                .into_iter()
                .filter_map(|file| file.into_path().ok())
                .collect()
        } else {
            builder
                .blocking_pick_file()
                .and_then(|file| file.into_path().ok())
                .into_iter()
                .collect()
        }
    })
    .await
    .map_err(|err| DevToolboxError::Internal(format!("file dialog failed: {err}")))
}

fn u32_param(params: &Value, key: &str, default: u32) -> Result<u32, DevToolboxError> {
    match params.get(key) {
        None => Ok(default),
        Some(value) => value
            .as_u64()
            .and_then(|number| u32::try_from(number).ok())
            .ok_or_else(|| {
                DevToolboxError::InvalidArgument(format!("'{key}' must be a non-negative integer"))
            }),
    }
}

/// Accept the v2 `channelId` and the SDK 1.x `terminalId`.
fn ssh_channel_param(params: &Value) -> Result<String, DevToolboxError> {
    optional_string(params, "channelId")
        .or_else(|| optional_string(params, "terminalId"))
        .map(str::to_string)
        .ok_or_else(|| {
            DevToolboxError::InvalidArgument("missing 'channelId' (or 'terminalId')".to_string())
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sdk_major_detection() {
        assert!(uses_legacy_sdk("1.0"));
        assert!(uses_legacy_sdk("1"));
        assert!(!uses_legacy_sdk("2.0"));
        assert!(!uses_legacy_sdk("2"));
        assert!(uses_legacy_sdk("unknown"));
    }

    #[test]
    fn storage_get_shape_depends_on_sdk() {
        assert_eq!(storage_get_response(Some(json!("x")), true), json!("x"));
        assert_eq!(storage_get_response(None, true), Value::Null);
        assert_eq!(
            storage_get_response(Some(json!("x")), false),
            json!({ "value": "x" })
        );
    }

    #[test]
    fn storage_keys_shape_depends_on_sdk() {
        assert_eq!(storage_keys_response(vec!["a".into()], true), json!(["a"]));
        assert_eq!(
            storage_keys_response(vec!["a".into()], false),
            json!({ "keys": ["a"] })
        );
    }

    #[test]
    fn log_level_aliases() {
        assert_eq!(log_level("log.info", &Value::Null), "info");
        assert_eq!(log_level("log.warn", &Value::Null), "warn");
        assert_eq!(log_level("log.log", &Value::Null), "info");
        assert_eq!(
            log_level("log.write", &json!({ "level": "error" })),
            "error"
        );
        assert_eq!(log_level("log.write", &Value::Null), "info");
    }
}
