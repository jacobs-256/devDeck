//! Raw TCP/UDP sockets for plugins (`net:socket`).
//!
//! A plugin is a sandboxed webview: it cannot open sockets itself, so the host
//! owns every connection and forwards data as events. Sessions are namespaced by
//! plugin id, capped in number, and killed when the plugin is disabled, closed,
//! or uninstalled.
//!
//! Data crossing the boundary is Base64 so binary protocols survive the JSON
//! bridge. A UTF-8 `text` field is included when the chunk is valid text, which
//! covers the common "send a line, print a line" case.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use base64::Engine;
use devdeck_contract::{DevDeckError, PluginId};
use serde::Serialize;
use serde_json::Value;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream, UdpSocket};
use tokio::sync::mpsc;

const MAX_SESSIONS_PER_PLUGIN: usize = 32;
const MAX_SEND_BYTES: usize = 1024 * 1024;
const READ_CHUNK: usize = 16 * 1024;

/// Callback used to deliver events to the renderer (or a test channel).
pub type EventSink = Arc<dyn Fn(Value) + Send + Sync>;

/// Event payload pushed to the plugin through `plugin-socket`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SocketEvent {
    pub plugin_id: String,
    pub session_id: String,
    /// connected | data | closed | error | listening | client-connected | client-closed
    pub event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remote: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl SocketEvent {
    fn new(plugin_id: &str, session_id: &str, event: &str) -> Self {
        Self {
            plugin_id: plugin_id.to_string(),
            session_id: session_id.to_string(),
            event: event.to_string(),
            data: None,
            text: None,
            client_id: None,
            remote: None,
            message: None,
        }
    }

    fn with_data(mut self, bytes: &[u8]) -> Self {
        self.data = Some(STANDARD.encode(bytes));
        self.text = std::str::from_utf8(bytes).ok().map(str::to_string);
        self
    }

    fn with_remote(mut self, remote: impl ToString) -> Self {
        self.remote = Some(remote.to_string());
        self
    }

    fn with_message(mut self, message: impl Into<String>) -> Self {
        self.message = Some(message.into());
        self
    }
}

const STANDARD: base64::engine::general_purpose::GeneralPurpose =
    base64::engine::general_purpose::STANDARD;

enum Outbound {
    Data(Vec<u8>),
    Close,
}

type ClientMap = Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Outbound>>>>;

struct Session {
    plugin_id: String,
    task: tokio::task::JoinHandle<()>,
    /// Writer channel for a TCP client session.
    outbound: Option<mpsc::UnboundedSender<Outbound>>,
    /// Accepted connections for a TCP server session.
    clients: Option<ClientMap>,
    /// Socket handle for a UDP session.
    udp: Option<Arc<UdpSocket>>,
}

/// Owns every plugin socket session for the process.
pub struct SocketManager {
    sessions: Mutex<HashMap<String, Session>>,
    emit: EventSink,
}

impl std::fmt::Debug for SocketManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SocketManager").finish_non_exhaustive()
    }
}

impl SocketManager {
    pub fn new(emit: EventSink) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            emit,
        }
    }

    fn session_count(&self, plugin_id: &str) -> usize {
        self.sessions
            .lock()
            .map(|sessions| {
                sessions
                    .values()
                    .filter(|session| session.plugin_id == plugin_id)
                    .count()
            })
            .unwrap_or(0)
    }

    fn ensure_capacity(&self, plugin_id: &str) -> Result<(), DevDeckError> {
        if self.session_count(plugin_id) >= MAX_SESSIONS_PER_PLUGIN {
            return Err(DevDeckError::denied(format!(
                "plugin '{plugin_id}' already has {MAX_SESSIONS_PER_PLUGIN} open socket sessions"
            )));
        }
        Ok(())
    }

    /// Open a TCP client connection.
    pub async fn tcp_connect(
        &self,
        plugin_id: &PluginId,
        host: &str,
        port: u16,
    ) -> Result<String, DevDeckError> {
        self.ensure_capacity(plugin_id.as_str())?;
        if host.trim().is_empty() {
            return Err(DevDeckError::InvalidArgument(
                "host is required".to_string(),
            ));
        }

        let address = tokio::net::lookup_host((host, port))
            .await
            .map_err(|err| {
                DevDeckError::InvalidArgument(format!("cannot resolve '{host}': {err}"))
            })?
            .next()
            .ok_or_else(|| {
                DevDeckError::InvalidArgument(format!("'{host}' did not resolve to an address"))
            })?;

        let stream = TcpStream::connect(address).await.map_err(|err| {
            DevDeckError::Internal(format!("TCP connect to {address} failed: {err}"))
        })?;
        stream.set_nodelay(true).ok();

        let session_id = uuid::Uuid::new_v4().to_string();
        let (outbound, mut outbound_rx) = mpsc::unbounded_channel::<Outbound>();
        let (mut reader, mut writer) = stream.into_split();

        let emit = self.emit.clone();
        let pid = plugin_id.to_string();
        let sid = session_id.clone();

        let task = tokio::spawn(async move {
            dispatch_into(
                &emit,
                SocketEvent::new(&pid, &sid, "connected").with_remote(address),
            );

            let mut buffer = vec![0u8; READ_CHUNK];
            let reason = loop {
                tokio::select! {
                    outbound = outbound_rx.recv() => match outbound {
                        Some(Outbound::Data(bytes)) => {
                            if let Err(err) = writer.write_all(&bytes).await {
                                break Some(format!("write failed: {err}"));
                            }
                        }
                        Some(Outbound::Close) | None => {
                            let _ = writer.shutdown().await;
                            break None;
                        }
                    },
                    read = reader.read(&mut buffer) => match read {
                        Ok(0) => break None,
                        Ok(count) => {
                            dispatch_into(
                                &emit,
                                SocketEvent::new(&pid, &sid, "data").with_data(&buffer[..count]),
                            );
                        }
                        Err(err) => break Some(format!("read failed: {err}")),
                    }
                }
            };

            match reason {
                Some(message) => dispatch_into(
                    &emit,
                    SocketEvent::new(&pid, &sid, "error").with_message(message),
                ),
                None => dispatch_into(&emit, SocketEvent::new(&pid, &sid, "closed")),
            }
        });

        self.sessions
            .lock()
            .map_err(|_| DevDeckError::Internal("socket session lock poisoned".to_string()))?
            .insert(
                session_id.clone(),
                Session {
                    plugin_id: plugin_id.to_string(),
                    task,
                    outbound: Some(outbound),
                    clients: None,
                    udp: None,
                },
            );

        Ok(session_id)
    }

    /// Send bytes on a TCP client session.
    pub fn tcp_send(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        bytes: Vec<u8>,
    ) -> Result<(), DevDeckError> {
        if bytes.len() > MAX_SEND_BYTES {
            return Err(DevDeckError::InvalidArgument(format!(
                "payload exceeds the {MAX_SEND_BYTES} byte limit"
            )));
        }
        let sessions = self.lock()?;
        let session = self.find(&sessions, plugin_id, session_id)?;
        let sender = session.outbound.as_ref().ok_or_else(|| {
            DevDeckError::InvalidArgument("session is not a TCP client session".to_string())
        })?;
        sender
            .send(Outbound::Data(bytes))
            .map_err(|_| DevDeckError::Internal("TCP session is already closed".to_string()))
    }

    /// Start a TCP server that accepts connections on `port` (0 = ephemeral).
    pub async fn tcp_listen(
        &self,
        plugin_id: &PluginId,
        host: &str,
        port: u16,
    ) -> Result<(String, u16), DevDeckError> {
        self.ensure_capacity(plugin_id.as_str())?;
        let bind_host = if host.trim().is_empty() {
            "127.0.0.1"
        } else {
            host
        };
        let listener = TcpListener::bind((bind_host, port)).await.map_err(|err| {
            DevDeckError::Internal(format!("cannot listen on {bind_host}:{port}: {err}"))
        })?;
        let local = listener
            .local_addr()
            .map_err(|err| DevDeckError::Internal(format!("listener address: {err}")))?;

        let session_id = uuid::Uuid::new_v4().to_string();
        let clients: ClientMap = Arc::new(Mutex::new(HashMap::new()));

        let emit = self.emit.clone();
        let pid = plugin_id.to_string();
        let sid = session_id.clone();
        let clients_task = clients.clone();

        let task = tokio::spawn(async move {
            dispatch_into(
                &emit,
                SocketEvent::new(&pid, &sid, "listening").with_remote(local),
            );

            loop {
                let (stream, peer) = match listener.accept().await {
                    Ok(pair) => pair,
                    Err(err) => {
                        dispatch_into(
                            &emit,
                            SocketEvent::new(&pid, &sid, "error")
                                .with_message(format!("accept failed: {err}")),
                        );
                        break;
                    }
                };
                stream.set_nodelay(true).ok();

                let client_id = uuid::Uuid::new_v4().to_string();
                let (outbound, mut outbound_rx) = mpsc::unbounded_channel::<Outbound>();
                if let Ok(mut map) = clients_task.lock() {
                    map.insert(client_id.clone(), outbound);
                }

                let client_emit = emit.clone();
                let client_pid = pid.clone();
                let client_sid = sid.clone();
                let client_cid = client_id.clone();
                let clients_for_task = clients_task.clone();
                let (mut reader, mut writer) = stream.into_split();

                tokio::spawn(async move {
                    dispatch_into(
                        &client_emit,
                        SocketEvent::new(&client_pid, &client_sid, "client-connected")
                            .with_remote(peer)
                            .with_client(&client_cid),
                    );

                    let mut buffer = vec![0u8; READ_CHUNK];
                    let reason = loop {
                        tokio::select! {
                            outbound = outbound_rx.recv() => match outbound {
                                Some(Outbound::Data(bytes)) => {
                                    if let Err(err) = writer.write_all(&bytes).await {
                                        break Some(format!("write failed: {err}"));
                                    }
                                }
                                Some(Outbound::Close) | None => {
                                    let _ = writer.shutdown().await;
                                    break None;
                                }
                            },
                            read = reader.read(&mut buffer) => match read {
                                Ok(0) => break None,
                                Ok(count) => {
                                    dispatch_into(
                                        &client_emit,
                                        SocketEvent::new(&client_pid, &client_sid, "data")
                                            .with_data(&buffer[..count])
                                            .with_client(&client_cid),
                                    );
                                }
                                Err(err) => break Some(format!("read failed: {err}")),
                            }
                        }
                    };

                    if let Ok(mut map) = clients_for_task.lock() {
                        map.remove(&client_cid);
                    }
                    let mut event = SocketEvent::new(&client_pid, &client_sid, "client-closed")
                        .with_client(&client_cid);
                    if let Some(message) = reason {
                        event = event.with_message(message);
                    }
                    dispatch_into(&client_emit, event);
                });
            }
        });

        self.lock()?.insert(
            session_id.clone(),
            Session {
                plugin_id: plugin_id.to_string(),
                task,
                outbound: None,
                clients: Some(clients),
                udp: None,
            },
        );

        Ok((session_id, local.port()))
    }

    /// Send bytes to one accepted client of a server session.
    pub fn server_send(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        client_id: &str,
        bytes: Vec<u8>,
    ) -> Result<(), DevDeckError> {
        if bytes.len() > MAX_SEND_BYTES {
            return Err(DevDeckError::InvalidArgument(format!(
                "payload exceeds the {MAX_SEND_BYTES} byte limit"
            )));
        }
        let sessions = self.lock()?;
        let session = self.find(&sessions, plugin_id, session_id)?;
        let clients = session.clients.as_ref().ok_or_else(|| {
            DevDeckError::InvalidArgument("session is not a TCP server session".to_string())
        })?;
        let map = clients
            .lock()
            .map_err(|_| DevDeckError::Internal("client map lock poisoned".to_string()))?;
        let sender = map.get(client_id).ok_or_else(|| {
            DevDeckError::NotFound(format!("client '{client_id}' is not connected"))
        })?;
        sender
            .send(Outbound::Data(bytes))
            .map_err(|_| DevDeckError::Internal("client is already closed".to_string()))
    }

    /// Disconnect one accepted client (the session keeps listening).
    pub fn server_kick(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        client_id: &str,
    ) -> Result<(), DevDeckError> {
        let sessions = self.lock()?;
        let session = self.find(&sessions, plugin_id, session_id)?;
        let clients = session.clients.as_ref().ok_or_else(|| {
            DevDeckError::InvalidArgument("session is not a TCP server session".to_string())
        })?;
        let map = clients
            .lock()
            .map_err(|_| DevDeckError::Internal("client map lock poisoned".to_string()))?;
        let sender = map.get(client_id).ok_or_else(|| {
            DevDeckError::NotFound(format!("client '{client_id}' is not connected"))
        })?;
        sender
            .send(Outbound::Close)
            .map_err(|_| DevDeckError::Internal("client is already closed".to_string()))
    }

    /// Bind a UDP socket.
    pub async fn udp_bind(
        &self,
        plugin_id: &PluginId,
        host: &str,
        port: u16,
    ) -> Result<(String, u16), DevDeckError> {
        self.ensure_capacity(plugin_id.as_str())?;
        let bind_host = if host.trim().is_empty() {
            "127.0.0.1"
        } else {
            host
        };
        let socket = UdpSocket::bind((bind_host, port)).await.map_err(|err| {
            DevDeckError::Internal(format!("cannot bind UDP {bind_host}:{port}: {err}"))
        })?;
        let local = socket
            .local_addr()
            .map_err(|err| DevDeckError::Internal(format!("UDP local address: {err}")))?;
        let socket = Arc::new(socket);

        let session_id = uuid::Uuid::new_v4().to_string();
        let emit = self.emit.clone();
        let pid = plugin_id.to_string();
        let sid = session_id.clone();
        let socket_task = socket.clone();

        let task = tokio::spawn(async move {
            dispatch_into(
                &emit,
                SocketEvent::new(&pid, &sid, "listening").with_remote(local),
            );
            let mut buffer = vec![0u8; 65_535];
            loop {
                match socket_task.recv_from(&mut buffer).await {
                    Ok((count, peer)) => dispatch_into(
                        &emit,
                        SocketEvent::new(&pid, &sid, "data")
                            .with_data(&buffer[..count])
                            .with_remote(peer),
                    ),
                    Err(err) => {
                        dispatch_into(
                            &emit,
                            SocketEvent::new(&pid, &sid, "error")
                                .with_message(format!("recv failed: {err}")),
                        );
                        break;
                    }
                }
            }
        });

        self.lock()?.insert(
            session_id.clone(),
            Session {
                plugin_id: plugin_id.to_string(),
                task,
                outbound: None,
                clients: None,
                udp: Some(socket),
            },
        );

        Ok((session_id, local.port()))
    }

    /// Send a UDP datagram from an existing bound session.
    pub async fn udp_send(
        &self,
        plugin_id: &PluginId,
        session_id: &str,
        host: &str,
        port: u16,
        bytes: Vec<u8>,
    ) -> Result<usize, DevDeckError> {
        if bytes.len() > MAX_SEND_BYTES {
            return Err(DevDeckError::InvalidArgument(format!(
                "payload exceeds the {MAX_SEND_BYTES} byte limit"
            )));
        }
        let socket = {
            let sessions = self.lock()?;
            let session = self.find(&sessions, plugin_id, session_id)?;
            session
                .udp
                .as_ref()
                .ok_or_else(|| {
                    DevDeckError::InvalidArgument("session is not a UDP session".to_string())
                })?
                .clone()
        };
        let target = tokio::net::lookup_host((host, port))
            .await
            .map_err(|err| {
                DevDeckError::InvalidArgument(format!("cannot resolve '{host}': {err}"))
            })?
            .next()
            .ok_or_else(|| {
                DevDeckError::InvalidArgument(format!("'{host}' did not resolve to an address"))
            })?;
        socket
            .send_to(&bytes, target)
            .await
            .map_err(|err| DevDeckError::Internal(format!("UDP send failed: {err}")))
    }

    /// Close one session and release its resources.
    pub fn close(&self, plugin_id: &PluginId, session_id: &str) -> Result<(), DevDeckError> {
        let session = {
            let mut sessions = self.lock()?;
            let session = sessions
                .get(session_id)
                .ok_or_else(|| DevDeckError::NotFound(format!("unknown session '{session_id}'")))?;
            if session.plugin_id != plugin_id.as_str() {
                return Err(DevDeckError::denied(
                    "session belongs to a different plugin",
                ));
            }
            sessions.remove(session_id)
        };

        let Some(session) = session else {
            return Err(DevDeckError::NotFound(format!(
                "unknown session '{session_id}'"
            )));
        };

        if let Some(sender) = &session.outbound {
            let _ = sender.send(Outbound::Close);
        }
        if let Some(clients) = &session.clients {
            if let Ok(map) = clients.lock() {
                for sender in map.values() {
                    let _ = sender.send(Outbound::Close);
                }
            }
        }

        session.task.abort();
        Ok(())
    }

    /// Session ids owned by a plugin, oldest first.
    pub fn sessions_of(&self, plugin_id: &PluginId) -> Vec<String> {
        let Ok(sessions) = self.sessions.lock() else {
            return Vec::new();
        };
        let mut ids: Vec<String> = sessions
            .iter()
            .filter(|(_, session)| session.plugin_id == plugin_id.as_str())
            .map(|(id, _)| id.clone())
            .collect();
        ids.sort();
        ids
    }

    /// The single session of a plugin, for legacy SDK calls that omitted ids.
    pub fn only_session(&self, plugin_id: &PluginId) -> Option<String> {
        let ids = self.sessions_of(plugin_id);
        if ids.len() == 1 {
            ids.into_iter().next()
        } else {
            None
        }
    }

    /// Close every session belonging to a plugin (disable / uninstall).
    pub fn close_all(&self, plugin_id: &PluginId) {
        let sessions: Vec<(String, Session)> = {
            let Ok(mut map) = self.sessions.lock() else {
                return;
            };
            let ids: Vec<String> = map
                .iter()
                .filter(|(_, session)| session.plugin_id == plugin_id.as_str())
                .map(|(id, _)| id.clone())
                .collect();
            ids.into_iter()
                .filter_map(|id| map.remove(&id).map(|session| (id, session)))
                .collect()
        };

        for (_, session) in sessions {
            if let Some(sender) = &session.outbound {
                let _ = sender.send(Outbound::Close);
            }
            if let Some(clients) = &session.clients {
                if let Ok(map) = clients.lock() {
                    for sender in map.values() {
                        let _ = sender.send(Outbound::Close);
                    }
                }
            }
            session.task.abort();
        }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, HashMap<String, Session>>, DevDeckError> {
        self.sessions
            .lock()
            .map_err(|_| DevDeckError::Internal("socket session lock poisoned".to_string()))
    }

    fn find<'a>(
        &self,
        sessions: &'a HashMap<String, Session>,
        plugin_id: &PluginId,
        session_id: &str,
    ) -> Result<&'a Session, DevDeckError> {
        let session = sessions
            .get(session_id)
            .ok_or_else(|| DevDeckError::NotFound(format!("unknown session '{session_id}'")))?;
        if session.plugin_id != plugin_id.as_str() {
            return Err(DevDeckError::denied(
                "session belongs to a different plugin",
            ));
        }
        Ok(session)
    }
}

impl SocketEvent {
    fn with_client(mut self, client_id: &str) -> Self {
        self.client_id = Some(client_id.to_string());
        self
    }
}

fn dispatch_into(emit: &EventSink, event: SocketEvent) {
    if let Ok(value) = serde_json::to_value(&event) {
        emit(value);
    }
}

/// Decode the SDK payload (`data` + `encoding`) into bytes.
pub fn decode_payload(data: &str, encoding: Option<&str>) -> Result<Vec<u8>, DevDeckError> {
    match encoding.unwrap_or("utf8") {
        "utf8" | "text" => Ok(data.as_bytes().to_vec()),
        "base64" => STANDARD
            .decode(data.trim())
            .map_err(|err| DevDeckError::InvalidArgument(format!("invalid Base64 payload: {err}"))),
        other => Err(DevDeckError::InvalidArgument(format!(
            "unknown encoding '{other}' (use 'utf8' or 'base64')"
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc as std_mpsc;
    use std::time::{Duration, Instant};

    fn test_manager() -> (SocketManager, std_mpsc::Receiver<Value>) {
        let (tx, rx) = std_mpsc::channel::<Value>();
        let manager = SocketManager::new(Arc::new(move |value| {
            let _ = tx.send(value);
        }));
        (manager, rx)
    }

    fn wait_for<F>(rx: &std_mpsc::Receiver<Value>, predicate: F, timeout: Duration) -> Value
    where
        F: Fn(&Value) -> bool,
    {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if let Ok(value) = rx.recv_timeout(Duration::from_millis(50)) {
                if predicate(&value) {
                    return value;
                }
            }
        }
        panic!("timed out waiting for socket event");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn tcp_server_and_client_exchange_data() {
        let (manager, rx) = test_manager();
        let plugin = PluginId::new("market-socket-test").unwrap();

        let (server_session, port) = manager.tcp_listen(&plugin, "127.0.0.1", 0).await.unwrap();
        let listening = wait_for(
            &rx,
            |event| event["event"] == "listening",
            Duration::from_secs(2),
        );
        assert_eq!(listening["sessionId"], server_session);

        let client_session = manager
            .tcp_connect(&plugin, "127.0.0.1", port)
            .await
            .unwrap();

        let connected = wait_for(
            &rx,
            |event| event["event"] == "client-connected",
            Duration::from_secs(2),
        );
        let client_id = connected["clientId"].as_str().unwrap().to_string();
        assert_eq!(connected["sessionId"], server_session);

        manager
            .tcp_send(&plugin, &client_session, b"ping".to_vec())
            .unwrap();
        let received = wait_for(
            &rx,
            |event| event["event"] == "data",
            Duration::from_secs(2),
        );
        assert_eq!(received["text"], "ping");

        manager
            .server_send(&plugin, &server_session, &client_id, b"pong".to_vec())
            .unwrap();
        let echoed = wait_for(
            &rx,
            |event| event["event"] == "data" && event["sessionId"] == client_session,
            Duration::from_secs(2),
        );
        assert_eq!(echoed["text"], "pong");

        manager.close(&plugin, &client_session).unwrap();
        manager.close(&plugin, &server_session).unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn udp_round_trip() {
        let (manager, rx) = test_manager();
        let plugin = PluginId::new("market-socket-test").unwrap();

        let (receiver_session, port) = manager.udp_bind(&plugin, "127.0.0.1", 0).await.unwrap();
        let (sender_session, _) = manager.udp_bind(&plugin, "127.0.0.1", 0).await.unwrap();

        wait_for(
            &rx,
            |event| event["event"] == "listening" && event["sessionId"] == receiver_session,
            Duration::from_secs(2),
        );

        manager
            .udp_send(
                &plugin,
                &sender_session,
                "127.0.0.1",
                port,
                b"hello udp".to_vec(),
            )
            .await
            .unwrap();

        let received = wait_for(
            &rx,
            |event| event["event"] == "data" && event["sessionId"] == receiver_session,
            Duration::from_secs(2),
        );
        assert_eq!(received["text"], "hello udp");

        manager.close(&plugin, &sender_session).unwrap();
        manager.close(&plugin, &receiver_session).unwrap();
    }

    #[test]
    fn payload_encoding_is_explicit() {
        assert_eq!(decode_payload("hi", None).unwrap(), b"hi");
        assert_eq!(decode_payload("aGk=", Some("base64")).unwrap(), b"hi");
        assert!(decode_payload("%%%", Some("base64")).is_err());
        assert!(decode_payload("hi", Some("rot13")).is_err());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn sessions_are_isolated_per_plugin() {
        let (manager, _rx) = test_manager();
        let owner = PluginId::new("market-owner").unwrap();
        let other = PluginId::new("market-other").unwrap();

        let (session, _) = manager.udp_bind(&owner, "127.0.0.1", 0).await.unwrap();
        let error = manager.close(&other, &session).unwrap_err();
        assert_eq!(error.code(), "permission_denied");

        manager.close(&owner, &session).unwrap();
        assert_eq!(
            manager.close(&owner, &session).unwrap_err().code(),
            "not_found"
        );
    }

    #[test]
    fn oversized_payloads_are_rejected() {
        let (manager, _rx) = test_manager();
        let plugin = PluginId::new("market-big").unwrap();
        let error = manager.tcp_send(&plugin, "missing", vec![0u8; MAX_SEND_BYTES + 1]);
        assert_eq!(error.unwrap_err().code(), "invalid_argument");
    }
}
