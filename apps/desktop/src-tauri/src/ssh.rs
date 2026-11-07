//! SSH and SFTP for plugins (`net:ssh`).
//!
//! The host owns every SSH connection: authentication happens in Rust, host keys
//! are pinned on first use (TOFU) in `known-hosts.json`, and terminal/SFTP data
//! crosses the JSON bridge as Base64 with a UTF-8 `text` companion field.
//!
//! Host-key policy: the first connection records the server key; any later
//! mismatch refuses the connection (`host_key_mismatch`) instead of silently
//! trusting a changed key.

use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use base64::Engine;
use devtoolbox_contract::{DevToolboxError, PluginId};
use russh::client::{self, AuthResult, Handle};
use russh::keys::{decode_secret_key, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{ChannelMsg, Disconnect};
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;

use crate::socket::EventSink;
use crate::state::now_ms;

const MAX_SESSIONS_PER_PLUGIN: usize = 8;
const MAX_WRITE_BYTES: usize = 1024 * 1024;
const MAX_SFTP_FILE_BYTES: usize = 8 * 1024 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(25);

const STANDARD: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;

/// Event pushed to the plugin through `plugin-ssh`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SshEvent {
    pub plugin_id: String,
    pub session_id: String,
    /// ready | data | eof | closed | exit | error
    pub event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    /// stdout | stderr
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stream: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<u32>,
}

impl SshEvent {
    fn new(plugin_id: &str, session_id: &str, event: &str) -> Self {
        Self {
            plugin_id: plugin_id.to_string(),
            session_id: session_id.to_string(),
            event: event.to_string(),
            channel_id: None,
            data: None,
            text: None,
            stream: None,
            message: None,
            code: None,
        }
    }

    fn with_channel(mut self, channel_id: &str) -> Self {
        self.channel_id = Some(channel_id.to_string());
        self
    }

    fn with_data(mut self, bytes: &[u8], stream: &str) -> Self {
        self.data = Some(STANDARD.encode(bytes));
        self.text = std::str::from_utf8(bytes).ok().map(str::to_string);
        self.stream = Some(stream.to_string());
        self
    }
}

/// A host key pinned on first use.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnownHost {
    fingerprint: String,
    key_type: String,
    added_at_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KnownHostsFile {
    #[serde(default = "default_schema")]
    schema_version: u32,
    #[serde(default)]
    hosts: BTreeMap<String, KnownHost>,
}

fn default_schema() -> u32 {
    1
}

/// Trust-on-first-use store for SSH host keys.
#[derive(Debug)]
pub struct KnownHosts {
    path: PathBuf,
    hosts: Mutex<BTreeMap<String, KnownHost>>,
}

impl KnownHosts {
    pub fn open(path: impl Into<PathBuf>) -> Result<Self, DevToolboxError> {
        let path = path.into();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let hosts = match std::fs::read(&path) {
            Ok(bytes) => {
                let file: KnownHostsFile = serde_json::from_slice(&bytes).map_err(|err| {
                    DevToolboxError::InvalidArgument(format!(
                        "known-hosts.json is unreadable: {err}"
                    ))
                })?;
                file.hosts
            }
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => BTreeMap::new(),
            Err(err) => return Err(err.into()),
        };
        Ok(Self {
            path,
            hosts: Mutex::new(hosts),
        })
    }

    /// `Ok(true)` when the key matches or was pinned now, `Ok(false)` on mismatch.
    fn verify(
        &self,
        host: &str,
        port: u16,
        fingerprint: &str,
        key_type: &str,
    ) -> Result<bool, DevToolboxError> {
        let key = format!("{host}:{port}");
        let mut hosts = self
            .hosts
            .lock()
            .map_err(|_| DevToolboxError::Internal("known hosts lock poisoned".to_string()))?;

        match hosts.get(&key) {
            Some(entry) => Ok(entry.fingerprint == fingerprint),
            None => {
                hosts.insert(
                    key,
                    KnownHost {
                        fingerprint: fingerprint.to_string(),
                        key_type: key_type.to_string(),
                        added_at_ms: now_ms(),
                    },
                );
                self.save_locked(&hosts)?;
                Ok(true)
            }
        }
    }

    fn forget(&self, host: &str, port: u16) -> Result<bool, DevToolboxError> {
        let key = format!("{host}:{port}");
        let mut hosts = self
            .hosts
            .lock()
            .map_err(|_| DevToolboxError::Internal("known hosts lock poisoned".to_string()))?;
        let removed = hosts.remove(&key).is_some();
        if removed {
            self.save_locked(&hosts)?;
        }
        Ok(removed)
    }

    fn save_locked(&self, hosts: &BTreeMap<String, KnownHost>) -> Result<(), DevToolboxError> {
        let file = KnownHostsFile {
            schema_version: 1,
            hosts: hosts.clone(),
        };
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&file)?)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

/// Returned to the plugin after a successful handshake + auth.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub fingerprint: String,
    pub key_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub fingerprint: String,
    pub channels: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectParams {
    pub host: String,
    #[serde(default = "default_port")]
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub private_key: Option<String>,
    #[serde(default)]
    pub passphrase: Option<String>,
    /// SDK 1.x callers pick their own session id; v2 lets the host generate one.
    #[serde(default)]
    pub session_id: Option<String>,
    /// SDK 1.x `ssh.connect` opened a shell immediately with this channel id.
    #[serde(default)]
    pub terminal_id: Option<String>,
    #[serde(default)]
    pub cols: Option<u32>,
    #[serde(default)]
    pub rows: Option<u32>,
}

fn default_port() -> u16 {
    22
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    /// file | dir | symlink | other
    pub kind: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpFile {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub encoding: String,
}

enum ChannelCommand {
    Data(Vec<u8>),
    Resize { cols: u32, rows: u32 },
    Close,
}

struct SshSession {
    plugin_id: String,
    host: String,
    port: u16,
    username: String,
    fingerprint: String,
    handle: Handle<ClientHandler>,
    commands: Mutex<HashMap<String, mpsc::UnboundedSender<ChannelCommand>>>,
    tasks: Mutex<HashMap<String, tokio::task::JoinHandle<()>>>,
    sftp: tokio::sync::Mutex<Option<SftpSession>>,
}

/// Owns every SSH session for the process.
pub struct SshManager {
    sessions: Mutex<HashMap<String, Arc<SshSession>>>,
    emit: EventSink,
    known_hosts: Arc<KnownHosts>,
}

impl std::fmt::Debug for SshManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SshManager").finish_non_exhaustive()
    }
}

impl SshManager {
    pub fn new(known_hosts: KnownHosts, emit: EventSink) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            emit,
            known_hosts: Arc::new(known_hosts),
        }
    }

    /// Connect + authenticate. Host keys are pinned on first use.
    pub async fn connect(
        &self,
        plugin_id: &PluginId,
        params: ConnectParams,
    ) -> Result<ConnectResult, DevToolboxError> {
        self.ensure_capacity(plugin_id)?;
        if params.host.trim().is_empty() {
            return Err(DevToolboxError::InvalidArgument(
                "host is required".to_string(),
            ));
        }
        if params.username.trim().is_empty() {
            return Err(DevToolboxError::InvalidArgument(
                "username is required".to_string(),
            ));
        }
        if params.password.is_none() && params.private_key.is_none() {
            return Err(DevToolboxError::InvalidArgument(
                "provide a password or an OpenSSH private key".to_string(),
            ));
        }

        let captured: Arc<Mutex<Option<(String, String)>>> = Arc::new(Mutex::new(None));
        let rejection: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
        let handler = ClientHandler {
            host: params.host.clone(),
            port: params.port,
            known_hosts: self.known_hosts.clone(),
            captured: captured.clone(),
            rejection: rejection.clone(),
        };

        let config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(300)),
            ..Default::default()
        });

        let mut handle = tokio::time::timeout(
            CONNECT_TIMEOUT,
            client::connect(config, (params.host.as_str(), params.port), handler),
        )
        .await
        .map_err(|_| DevToolboxError::Internal("SSH handshake timed out".to_string()))?
        .map_err(|err| {
            let rejected = rejection.lock().ok().and_then(|value| value.clone());
            match rejected {
                Some(message) => DevToolboxError::denied(message),
                None => DevToolboxError::Internal(format!("SSH connection failed: {err}")),
            }
        })?;

        let (fingerprint, key_type) = captured
            .lock()
            .ok()
            .and_then(|value| value.clone())
            .ok_or_else(|| {
                DevToolboxError::Internal("server did not present a host key".to_string())
            })?;

        let auth = if let Some(private_key) = params.private_key.as_deref() {
            let key =
                decode_secret_key(private_key, params.passphrase.as_deref()).map_err(|err| {
                    DevToolboxError::InvalidArgument(format!("invalid private key: {err}"))
                })?;
            let hash = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|err| DevToolboxError::Internal(format!("SSH negotiation failed: {err}")))?
                .flatten();
            handle
                .authenticate_publickey(
                    params.username.clone(),
                    PrivateKeyWithHashAlg::new(Arc::new(key), hash),
                )
                .await
        } else {
            handle
                .authenticate_password(
                    params.username.clone(),
                    params.password.clone().unwrap_or_default(),
                )
                .await
        }
        .map_err(|err| DevToolboxError::Internal(format!("SSH authentication failed: {err}")))?;

        if !matches!(auth, AuthResult::Success) {
            let _ = handle
                .disconnect(Disconnect::ByApplication, "authentication failed", "")
                .await;
            return Err(DevToolboxError::denied(
                "SSH authentication failed; check the username and credentials",
            ));
        }

        let session_id = match params.session_id.as_deref() {
            Some(requested) => {
                if requested.trim().is_empty() || requested.len() > 128 {
                    return Err(DevToolboxError::InvalidArgument(
                        "sessionId must be 1-128 characters".to_string(),
                    ));
                }
                if self.lock()?.contains_key(requested) {
                    return Err(DevToolboxError::InvalidArgument(format!(
                        "SSH session '{requested}' already exists"
                    )));
                }
                requested.to_string()
            }
            None => uuid::Uuid::new_v4().to_string(),
        };
        let session = Arc::new(SshSession {
            plugin_id: plugin_id.to_string(),
            host: params.host.clone(),
            port: params.port,
            username: params.username.clone(),
            fingerprint: fingerprint.clone(),
            handle,
            commands: Mutex::new(HashMap::new()),
            tasks: Mutex::new(HashMap::new()),
            sftp: tokio::sync::Mutex::new(None),
        });

        self.lock()?.insert(session_id.clone(), session);

        Ok(ConnectResult {
            session_id,
            host: params.host,
            port: params.port,
            username: params.username,
            fingerprint,
            key_type,
        })
    }

    /// Open an interactive shell (PTY + shell).
    pub async fn open_shell(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        cols: u32,
        rows: u32,
        term: &str,
        channel_id: Option<&str>,
    ) -> Result<String, DevToolboxError> {
        let session = self.session(plugin_id, session_id)?;
        let channel =
            session.handle.channel_open_session().await.map_err(|err| {
                DevToolboxError::Internal(format!("cannot open SSH channel: {err}"))
            })?;
        let (mut read_half, write_half) = channel.split();

        write_half
            .request_pty(true, term, cols.max(1), rows.max(1), 0, 0, &[])
            .await
            .map_err(|err| DevToolboxError::Internal(format!("PTY request failed: {err}")))?;
        write_half
            .request_shell(true)
            .await
            .map_err(|err| DevToolboxError::Internal(format!("shell request failed: {err}")))?;

        let channel_id = match channel_id {
            Some(requested) if !requested.trim().is_empty() => requested.to_string(),
            _ => uuid::Uuid::new_v4().to_string(),
        };
        let (tx, mut rx) = mpsc::unbounded_channel::<ChannelCommand>();
        session
            .commands
            .lock()
            .map_err(|_| DevToolboxError::Internal("SSH channel lock poisoned".to_string()))?
            .insert(channel_id.clone(), tx);

        let emit = self.emit.clone();
        let pid = plugin_id.to_string();
        let sid = session_id.to_string();
        let cid = channel_id.clone();
        let task = tokio::spawn(async move {
            emit_into(&emit, SshEvent::new(&pid, &sid, "ready").with_channel(&cid));
            run_channel(
                &emit,
                &pid,
                &sid,
                &cid,
                &mut read_half,
                &write_half,
                &mut rx,
            )
            .await;
        });
        session
            .tasks
            .lock()
            .ok()
            .map(|mut tasks| tasks.insert(channel_id.clone(), task));

        Ok(channel_id)
    }

    /// Run a single command (no PTY).
    pub async fn exec(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        command: &str,
        channel_id: Option<&str>,
    ) -> Result<String, DevToolboxError> {
        if command.trim().is_empty() {
            return Err(DevToolboxError::InvalidArgument(
                "command must not be empty".to_string(),
            ));
        }
        let session = self.session(plugin_id, session_id)?;
        let channel =
            session.handle.channel_open_session().await.map_err(|err| {
                DevToolboxError::Internal(format!("cannot open SSH channel: {err}"))
            })?;
        let (mut read_half, write_half) = channel.split();
        write_half
            .exec(true, command.as_bytes())
            .await
            .map_err(|err| DevToolboxError::Internal(format!("exec request failed: {err}")))?;

        let channel_id = match channel_id {
            Some(requested) if !requested.trim().is_empty() => requested.to_string(),
            _ => uuid::Uuid::new_v4().to_string(),
        };
        let (tx, mut rx) = mpsc::unbounded_channel::<ChannelCommand>();
        session
            .commands
            .lock()
            .map_err(|_| DevToolboxError::Internal("SSH channel lock poisoned".to_string()))?
            .insert(channel_id.clone(), tx);

        let emit = self.emit.clone();
        let pid = plugin_id.to_string();
        let sid = session_id.to_string();
        let cid = channel_id.clone();
        let task = tokio::spawn(async move {
            run_channel(
                &emit,
                &pid,
                &sid,
                &cid,
                &mut read_half,
                &write_half,
                &mut rx,
            )
            .await;
        });
        session
            .tasks
            .lock()
            .ok()
            .map(|mut tasks| tasks.insert(channel_id.clone(), task));

        Ok(channel_id)
    }

    pub fn write(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        channel_id: &str,
        bytes: Vec<u8>,
    ) -> Result<(), DevToolboxError> {
        if bytes.len() > MAX_WRITE_BYTES {
            return Err(DevToolboxError::InvalidArgument(format!(
                "payload exceeds the {MAX_WRITE_BYTES} byte limit"
            )));
        }
        let sender = self.channel(plugin_id, session_id, channel_id)?;
        sender
            .send(ChannelCommand::Data(bytes))
            .map_err(|_| DevToolboxError::Internal("SSH channel is already closed".to_string()))
    }

    pub fn resize(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        channel_id: &str,
        cols: u32,
        rows: u32,
    ) -> Result<(), DevToolboxError> {
        let sender = self.channel(plugin_id, session_id, channel_id)?;
        sender
            .send(ChannelCommand::Resize { cols, rows })
            .map_err(|_| DevToolboxError::Internal("SSH channel is already closed".to_string()))
    }

    pub fn close_channel(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        channel_id: &str,
    ) -> Result<(), DevToolboxError> {
        let session = self.session(plugin_id, session_id)?;
        let sender = session
            .commands
            .lock()
            .map_err(|_| DevToolboxError::Internal("SSH channel lock poisoned".to_string()))?
            .remove(channel_id)
            .ok_or_else(|| DevToolboxError::NotFound(format!("unknown channel '{channel_id}'")))?;
        let _ = sender.send(ChannelCommand::Close);
        if let Ok(mut tasks) = session.tasks.lock() {
            if let Some(task) = tasks.remove(channel_id) {
                task.abort();
            }
        }
        Ok(())
    }

    pub async fn disconnect(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
    ) -> Result<(), DevToolboxError> {
        let session = {
            let mut sessions = self.lock()?;
            match sessions.get(session_id) {
                Some(session) if session.plugin_id == plugin_id.as_str() => {
                    sessions.remove(session_id)
                }
                Some(_) => {
                    return Err(DevToolboxError::denied(
                        "session belongs to a different plugin",
                    ))
                }
                None => {
                    return Err(DevToolboxError::NotFound(format!(
                        "unknown SSH session '{session_id}'"
                    )))
                }
            }
        };

        if let Some(session) = session {
            if let Ok(tasks) = session.tasks.lock() {
                for task in tasks.values() {
                    task.abort();
                }
            }
            let _ = session
                .handle
                .disconnect(Disconnect::ByApplication, "closed by user", "")
                .await;
        }
        Ok(())
    }

    pub fn close_all(&self, plugin_id: &PluginId) {
        let removed: Vec<Arc<SshSession>> = {
            let Ok(mut sessions) = self.sessions.lock() else {
                return;
            };
            let ids: Vec<String> = sessions
                .iter()
                .filter(|(_, session)| session.plugin_id == plugin_id.as_str())
                .map(|(id, _)| id.clone())
                .collect();
            ids.into_iter()
                .filter_map(|id| sessions.remove(&id))
                .collect()
        };

        for session in removed {
            if let Ok(tasks) = session.tasks.lock() {
                for task in tasks.values() {
                    task.abort();
                }
            }
            let session = session.clone();
            tauri::async_runtime::spawn(async move {
                let _ = session
                    .handle
                    .disconnect(Disconnect::ByApplication, "plugin closed", "")
                    .await;
            });
        }
    }

    pub fn list(&self, plugin_id: &PluginId) -> Vec<SessionInfo> {
        let Ok(sessions) = self.sessions.lock() else {
            return Vec::new();
        };
        let mut items: Vec<SessionInfo> = sessions
            .iter()
            .filter(|(_, session)| session.plugin_id == plugin_id.as_str())
            .map(|(id, session)| SessionInfo {
                session_id: id.clone(),
                host: session.host.clone(),
                port: session.port,
                username: session.username.clone(),
                fingerprint: session.fingerprint.clone(),
                channels: session.commands.lock().map(|map| map.len()).unwrap_or(0),
            })
            .collect();
        items.sort_by(|a, b| a.session_id.cmp(&b.session_id));
        items
    }

    pub fn forget_host(&self, host: &str, port: u16) -> Result<bool, DevToolboxError> {
        self.known_hosts.forget(host, port)
    }

    // ---- SFTP ----

    pub async fn sftp_list(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        path: &str,
    ) -> Result<Vec<SftpEntry>, DevToolboxError> {
        let session = self.session(plugin_id, session_id)?;
        let guard = self.sftp_guard(&session, path).await?;
        let sftp = guard
            .as_ref()
            .ok_or_else(|| DevToolboxError::Internal("SFTP session unavailable".to_string()))?;

        let mut entries = Vec::new();
        for entry in sftp
            .read_dir(path)
            .await
            .map_err(|err| DevToolboxError::Internal(format!("SFTP list failed: {err}")))?
        {
            let metadata = entry.metadata();
            entries.push(SftpEntry {
                name: entry.file_name(),
                path: entry.path(),
                kind: if metadata.is_dir() {
                    "dir".to_string()
                } else if metadata.is_symlink() {
                    "symlink".to_string()
                } else if metadata.file_type().is_file() {
                    "file".to_string()
                } else {
                    "other".to_string()
                },
                size: metadata.len(),
                modified_ms: metadata.modified().ok().and_then(|time| {
                    time.duration_since(std::time::UNIX_EPOCH)
                        .ok()
                        .map(|duration| duration.as_millis() as u64)
                }),
            });
        }
        entries.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(entries)
    }

    pub async fn sftp_read(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        path: &str,
        encoding: Option<&str>,
    ) -> Result<SftpFile, DevToolboxError> {
        let session = self.session(plugin_id, session_id)?;
        let guard = self.sftp_guard(&session, path).await?;
        let sftp = guard
            .as_ref()
            .ok_or_else(|| DevToolboxError::Internal("SFTP session unavailable".to_string()))?;

        let metadata = sftp
            .metadata(path)
            .await
            .map_err(|err| DevToolboxError::Internal(format!("SFTP stat failed: {err}")))?;
        if metadata.len() > MAX_SFTP_FILE_BYTES as u64 {
            return Err(DevToolboxError::InvalidArgument(
                "remote file is larger than the 8 MiB limit".to_string(),
            ));
        }
        let bytes = sftp
            .read(path)
            .await
            .map_err(|err| DevToolboxError::Internal(format!("SFTP read failed: {err}")))?;
        let (content, encoding) = encode_bytes(&bytes, encoding)?;
        Ok(SftpFile {
            path: path.to_string(),
            content,
            size: bytes.len() as u64,
            encoding,
        })
    }

    pub async fn sftp_write(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        path: &str,
        content: &str,
        encoding: Option<&str>,
    ) -> Result<u64, DevToolboxError> {
        let bytes = decode_content(content, encoding)?;
        if bytes.len() > MAX_SFTP_FILE_BYTES {
            return Err(DevToolboxError::InvalidArgument(
                "content is larger than the 8 MiB limit".to_string(),
            ));
        }
        let session = self.session(plugin_id, session_id)?;
        let guard = self.sftp_guard(&session, path).await?;
        let sftp = guard
            .as_ref()
            .ok_or_else(|| DevToolboxError::Internal("SFTP session unavailable".to_string()))?;
        sftp.write(path, &bytes)
            .await
            .map_err(|err| DevToolboxError::Internal(format!("SFTP write failed: {err}")))?;
        Ok(bytes.len() as u64)
    }

    pub async fn sftp_mkdir(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        path: &str,
    ) -> Result<(), DevToolboxError> {
        let session = self.session(plugin_id, session_id)?;
        let guard = self.sftp_guard(&session, path).await?;
        let sftp = guard
            .as_ref()
            .ok_or_else(|| DevToolboxError::Internal("SFTP session unavailable".to_string()))?;
        sftp.create_dir(path)
            .await
            .map_err(|err| DevToolboxError::Internal(format!("SFTP mkdir failed: {err}")))
    }

    pub async fn sftp_remove(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        path: &str,
        directory: bool,
    ) -> Result<(), DevToolboxError> {
        let session = self.session(plugin_id, session_id)?;
        let guard = self.sftp_guard(&session, path).await?;
        let sftp = guard
            .as_ref()
            .ok_or_else(|| DevToolboxError::Internal("SFTP session unavailable".to_string()))?;
        if directory {
            sftp.remove_dir(path)
                .await
                .map_err(|err| DevToolboxError::Internal(format!("SFTP rmdir failed: {err}")))
        } else {
            sftp.remove_file(path)
                .await
                .map_err(|err| DevToolboxError::Internal(format!("SFTP remove failed: {err}")))
        }
    }

    pub async fn sftp_rename(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        from: &str,
        to: &str,
    ) -> Result<(), DevToolboxError> {
        let session = self.session(plugin_id, session_id)?;
        let guard = self.sftp_guard(&session, from).await?;
        let sftp = guard
            .as_ref()
            .ok_or_else(|| DevToolboxError::Internal("SFTP session unavailable".to_string()))?;
        sftp.rename(from, to)
            .await
            .map_err(|err| DevToolboxError::Internal(format!("SFTP rename failed: {err}")))
    }

    pub async fn sftp_realpath(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        path: &str,
    ) -> Result<String, DevToolboxError> {
        let session = self.session(plugin_id, session_id)?;
        let guard = self.sftp_guard(&session, path).await?;
        let sftp = guard
            .as_ref()
            .ok_or_else(|| DevToolboxError::Internal("SFTP session unavailable".to_string()))?;
        sftp.canonicalize(path)
            .await
            .map_err(|err| DevToolboxError::Internal(format!("SFTP realpath failed: {err}")))
    }

    async fn sftp_guard<'a>(
        &self,
        session: &'a Arc<SshSession>,
        path: &str,
    ) -> Result<tokio::sync::MutexGuard<'a, Option<SftpSession>>, DevToolboxError> {
        if path.trim().is_empty() {
            return Err(DevToolboxError::InvalidArgument(
                "path must not be empty".to_string(),
            ));
        }
        let mut guard = session.sftp.lock().await;
        if guard.is_none() {
            let channel = session.handle.channel_open_session().await.map_err(|err| {
                DevToolboxError::Internal(format!("cannot open SFTP channel: {err}"))
            })?;
            channel
                .request_subsystem(true, "sftp")
                .await
                .map_err(|err| {
                    DevToolboxError::Internal(format!("SFTP subsystem failed: {err}"))
                })?;
            let sftp = SftpSession::new(channel.into_stream())
                .await
                .map_err(|err| DevToolboxError::Internal(format!("SFTP init failed: {err}")))?;
            *guard = Some(sftp);
        }
        Ok(guard)
    }

    fn session(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
    ) -> Result<Arc<SshSession>, DevToolboxError> {
        let sessions = self.lock()?;
        let session = sessions.get(session_id).ok_or_else(|| {
            DevToolboxError::NotFound(format!("unknown SSH session '{session_id}'"))
        })?;
        if session.plugin_id != plugin_id.as_str() {
            return Err(DevToolboxError::denied(
                "SSH session belongs to a different plugin",
            ));
        }
        Ok(session.clone())
    }

    fn channel(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        channel_id: &str,
    ) -> Result<mpsc::UnboundedSender<ChannelCommand>, DevToolboxError> {
        let session = self.session(plugin_id, session_id)?;
        let commands = session
            .commands
            .lock()
            .map_err(|_| DevToolboxError::Internal("SSH channel lock poisoned".to_string()))?;
        commands
            .get(channel_id)
            .cloned()
            .ok_or_else(|| DevToolboxError::NotFound(format!("unknown channel '{channel_id}'")))
    }

    fn ensure_capacity(&self, plugin_id: &PluginId) -> Result<(), DevToolboxError> {
        let count = self
            .lock()?
            .values()
            .filter(|session| session.plugin_id == plugin_id.as_str())
            .count();
        if count >= MAX_SESSIONS_PER_PLUGIN {
            return Err(DevToolboxError::denied(format!(
                "plugin '{plugin_id}' already has {MAX_SESSIONS_PER_PLUGIN} SSH sessions"
            )));
        }
        Ok(())
    }

    fn lock(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, HashMap<String, Arc<SshSession>>>, DevToolboxError> {
        self.sessions
            .lock()
            .map_err(|_| DevToolboxError::Internal("SSH session lock poisoned".to_string()))
    }
}

struct ClientHandler {
    host: String,
    port: u16,
    known_hosts: Arc<KnownHosts>,
    captured: Arc<Mutex<Option<(String, String)>>>,
    rejection: Arc<Mutex<Option<String>>>,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        let (fingerprint, key_type) = match server_public_key {
            PublicKeyOrCertificate::PublicKey { key, .. } => (
                key.fingerprint(russh::keys::HashAlg::Sha256).to_string(),
                format!("{:?}", key.algorithm()),
            ),
            PublicKeyOrCertificate::Certificate(certificate) => {
                let key_data = certificate.public_key();
                (
                    key_data
                        .fingerprint(russh::keys::HashAlg::Sha256)
                        .to_string(),
                    format!("{:?}", key_data.algorithm()),
                )
            }
        };

        match self
            .known_hosts
            .verify(&self.host, self.port, &fingerprint, &key_type)
        {
            Ok(true) => {
                if let Ok(mut captured) = self.captured.lock() {
                    *captured = Some((fingerprint, key_type));
                }
                Ok(true)
            }
            Ok(false) => {
                if let Ok(mut rejection) = self.rejection.lock() {
                    *rejection = Some(format!(
                        "host key mismatch for {}:{}; if the change is expected, remove the pinned key first",
                        self.host, self.port
                    ));
                }
                Ok(false)
            }
            Err(_) => Ok(false),
        }
    }
}

async fn run_channel<S>(
    emit: &EventSink,
    plugin_id: &str,
    session_id: &str,
    channel_id: &str,
    read_half: &mut russh::ChannelReadHalf,
    write_half: &russh::ChannelWriteHalf<S>,
    commands: &mut mpsc::UnboundedReceiver<ChannelCommand>,
) where
    S: From<(russh::ChannelId, ChannelMsg)> + Send + Sync + 'static,
{
    loop {
        tokio::select! {
            message = read_half.wait() => match message {
                Some(ChannelMsg::Data { data }) => {
                    emit_into(
                        emit,
                        SshEvent::new(plugin_id, session_id, "data")
                            .with_channel(channel_id)
                            .with_data(&data, "stdout"),
                    );
                }
                Some(ChannelMsg::ExtendedData { data, .. }) => {
                    emit_into(
                        emit,
                        SshEvent::new(plugin_id, session_id, "data")
                            .with_channel(channel_id)
                            .with_data(&data, "stderr"),
                    );
                }
                Some(ChannelMsg::ExitStatus { exit_status }) => {
                    let mut event =
                        SshEvent::new(plugin_id, session_id, "exit").with_channel(channel_id);
                    event.code = Some(exit_status);
                    emit_into(emit, event);
                }
                Some(ChannelMsg::Eof) => {
                    emit_into(
                        emit,
                        SshEvent::new(plugin_id, session_id, "eof").with_channel(channel_id),
                    );
                }
                Some(ChannelMsg::Close) | None => {
                    emit_into(
                        emit,
                        SshEvent::new(plugin_id, session_id, "closed").with_channel(channel_id),
                    );
                    break;
                }
                _ => {}
            },
            command = commands.recv() => match command {
                Some(ChannelCommand::Data(bytes)) => {
                    if write_half.data_bytes(bytes).await.is_err() {
                        break;
                    }
                }
                Some(ChannelCommand::Resize { cols, rows }) => {
                    let _ = write_half.window_change(cols, rows, 0, 0).await;
                }
                Some(ChannelCommand::Close) | None => {
                    let _ = write_half.eof().await;
                    let _ = write_half.close().await;
                    emit_into(
                        emit,
                        SshEvent::new(plugin_id, session_id, "closed").with_channel(channel_id),
                    );
                    break;
                }
            }
        }
    }
}

fn emit_into(emit: &EventSink, event: SshEvent) {
    if let Ok(value) = serde_json::to_value(&event) {
        emit(value);
    }
}

fn encode_bytes(bytes: &[u8], encoding: Option<&str>) -> Result<(String, String), DevToolboxError> {
    match encoding.unwrap_or("utf8") {
        "base64" => Ok((STANDARD.encode(bytes), "base64".to_string())),
        "utf8" | "utf-8" | "text" => String::from_utf8(bytes.to_vec())
            .map(|text| (text, "utf8".to_string()))
            .map_err(|_| {
                DevToolboxError::InvalidArgument(
                    "remote file is not valid UTF-8; read it with base64 encoding".to_string(),
                )
            }),
        other => Err(DevToolboxError::InvalidArgument(format!(
            "unknown encoding '{other}' (use 'utf8' or 'base64')"
        ))),
    }
}

fn decode_content(content: &str, encoding: Option<&str>) -> Result<Vec<u8>, DevToolboxError> {
    match encoding.unwrap_or("utf8") {
        "base64" => STANDARD.decode(content.trim()).map_err(|err| {
            DevToolboxError::InvalidArgument(format!("invalid Base64 content: {err}"))
        }),
        "utf8" | "utf-8" | "text" => Ok(content.as_bytes().to_vec()),
        other => Err(DevToolboxError::InvalidArgument(format!(
            "unknown encoding '{other}' (use 'utf8' or 'base64')"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fingerprint(seed: &str) -> String {
        devtoolbox_market::signing::sha256_hex(seed.as_bytes())
    }

    #[test]
    fn pins_host_key_on_first_use() {
        let dir = tempfile::tempdir().unwrap();
        let known = KnownHosts::open(dir.path().join("known-hosts.json")).unwrap();
        let fp = fingerprint("server-key");
        assert!(known.verify("example.com", 22, &fp, "Ed25519").unwrap());
        // Same key on reconnect.
        assert!(known.verify("example.com", 22, &fp, "Ed25519").unwrap());
    }

    #[test]
    fn rejects_changed_host_key() {
        let dir = tempfile::tempdir().unwrap();
        let known = KnownHosts::open(dir.path().join("known-hosts.json")).unwrap();
        assert!(known
            .verify("example.com", 22, &fingerprint("key-a"), "Ed25519")
            .unwrap());
        assert!(!known
            .verify("example.com", 22, &fingerprint("key-b"), "Ed25519")
            .unwrap());
    }

    #[test]
    fn pins_are_persisted_and_scoped_by_port() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("known-hosts.json");
        let fp = fingerprint("key");
        {
            let known = KnownHosts::open(&path).unwrap();
            assert!(known.verify("example.com", 22, &fp, "Ed25519").unwrap());
        }
        let reopened = KnownHosts::open(&path).unwrap();
        assert!(reopened.verify("example.com", 22, &fp, "Ed25519").unwrap());
        // A different port is a different pin.
        assert!(reopened
            .verify("example.com", 2222, &fp, "Ed25519")
            .unwrap());
    }

    #[test]
    fn forget_removes_a_pin() {
        let dir = tempfile::tempdir().unwrap();
        let known = KnownHosts::open(dir.path().join("known-hosts.json")).unwrap();
        let fp = fingerprint("key");
        known.verify("example.com", 22, &fp, "Ed25519").unwrap();
        assert!(known.forget("example.com", 22).unwrap());
        assert!(!known.forget("example.com", 22).unwrap());
        // After forgetting, a new key is pinned again.
        assert!(known
            .verify("example.com", 22, &fingerprint("other"), "Ed25519")
            .unwrap());
    }

    #[test]
    fn encoding_round_trip() {
        assert_eq!(
            encode_bytes(b"hi", None).unwrap(),
            ("hi".to_string(), "utf8".to_string())
        );
        assert_eq!(
            encode_bytes(&[0xff, 0xfe], Some("base64")).unwrap().0,
            "//4="
        );
        assert!(encode_bytes(&[0xff], None).is_err());
        assert_eq!(
            decode_content("//4=", Some("base64")).unwrap(),
            vec![0xff, 0xfe]
        );
    }
}

#[cfg(test)]
#[path = "ssh_e2e_tests.rs"]
mod e2e_tests;
