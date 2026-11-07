//! MQTT client for the built-in MQTT tool.
//!
//! Built-in tools run in the trusted renderer, so this uses plain Tauri commands
//! rather than the plugin capability broker. Sessions are capped, URLs are
//! validated (mqtt/mqtts only), and every event is pushed to the renderer as
//! JSON so the UI can show a live message log.

use std::collections::HashMap;
use std::sync::Mutex;

use devtoolbox_contract::DevToolboxError;
use rumqttc::{AsyncClient, Event, Incoming, MqttOptions, QoS, Transport};
use serde::Serialize;
use url::Url;

use crate::socket::EventSink;

const MAX_SESSIONS: usize = 8;
const MAX_TOPIC_LEN: usize = 512;
const MAX_PAYLOAD_BYTES: usize = 256 * 1024;

/// Event pushed to the renderer on `tool-mqtt`.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttEvent {
    pub session_id: String,
    /// connected | message | subscribed | disconnected | error
    pub event: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub qos: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retain: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl MqttEvent {
    fn new(session_id: &str, event: &str) -> Self {
        Self {
            session_id: session_id.to_string(),
            event: event.to_string(),
            topic: None,
            payload: None,
            qos: None,
            retain: None,
            message: None,
        }
    }
}

struct Session {
    client: AsyncClient,
    task: tokio::task::JoinHandle<()>,
    broker: String,
}

/// Owns MQTT sessions for the app.
pub struct MqttManager {
    sessions: Mutex<HashMap<String, Session>>,
    emit: EventSink,
}

impl std::fmt::Debug for MqttManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("MqttManager").finish_non_exhaustive()
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MqttSessionInfo {
    pub session_id: String,
    pub broker: String,
}

fn parse_broker(raw: &str) -> Result<(String, u16, bool), DevToolboxError> {
    let url = Url::parse(raw.trim())
        .map_err(|err| DevToolboxError::InvalidArgument(format!("invalid broker URL: {err}")))?;
    if !url.username().is_empty() || url.password().is_some() {
        return Err(DevToolboxError::InvalidArgument(
            "put credentials in the username/password fields, not the URL".to_string(),
        ));
    }

    let (host, port, tls) = match url.scheme() {
        "mqtt" => (
            url.host_str()
                .ok_or_else(|| {
                    DevToolboxError::InvalidArgument("broker URL has no host".to_string())
                })?
                .to_string(),
            url.port().unwrap_or(1883),
            false,
        ),
        "mqtts" => (
            url.host_str()
                .ok_or_else(|| {
                    DevToolboxError::InvalidArgument("broker URL has no host".to_string())
                })?
                .to_string(),
            url.port().unwrap_or(8883),
            true,
        ),
        other => {
            return Err(DevToolboxError::InvalidArgument(format!(
                "broker URL must use mqtt:// or mqtts://, got '{other}'"
            )))
        }
    };

    if url.path() != "/" && !url.path().is_empty() {
        return Err(DevToolboxError::InvalidArgument(
            "broker URL must not contain a path".to_string(),
        ));
    }

    Ok((host, port, tls))
}

fn parse_qos(value: Option<u8>) -> Result<QoS, DevToolboxError> {
    match value.unwrap_or(0) {
        0 => Ok(QoS::AtMostOnce),
        1 => Ok(QoS::AtLeastOnce),
        2 => Ok(QoS::ExactlyOnce),
        other => Err(DevToolboxError::InvalidArgument(format!(
            "QoS must be 0, 1, or 2 (got {other})"
        ))),
    }
}

fn validate_topic(topic: &str) -> Result<&str, DevToolboxError> {
    let trimmed = topic.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_TOPIC_LEN || trimmed.contains('\0') {
        return Err(DevToolboxError::InvalidArgument(
            "topic must be 1-512 characters and contain no NUL bytes".to_string(),
        ));
    }
    Ok(trimmed)
}

impl MqttManager {
    pub fn new(emit: EventSink) -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            emit,
        }
    }

    fn session(&self, session_id: &str) -> Result<AsyncClient, DevToolboxError> {
        let sessions = self
            .sessions
            .lock()
            .map_err(|_| DevToolboxError::Internal("MQTT session lock poisoned".to_string()))?;
        sessions
            .get(session_id)
            .map(|session| session.client.clone())
            .ok_or_else(|| {
                DevToolboxError::NotFound(format!("unknown MQTT session '{session_id}'"))
            })
    }

    pub async fn connect(
        &self,
        broker: &str,
        client_id: &str,
        username: Option<&str>,
        password: Option<&str>,
        keep_alive_secs: u16,
    ) -> Result<String, DevToolboxError> {
        {
            let sessions = self
                .sessions
                .lock()
                .map_err(|_| DevToolboxError::Internal("MQTT session lock poisoned".to_string()))?;
            if sessions.len() >= MAX_SESSIONS {
                return Err(DevToolboxError::denied(format!(
                    "at most {MAX_SESSIONS} MQTT sessions can be open at once"
                )));
            }
        }

        let (host, port, tls) = parse_broker(broker)?;
        let client_id = if client_id.trim().is_empty() {
            format!("devtoolbox-{}", uuid::Uuid::new_v4().simple())
        } else {
            client_id.trim().to_string()
        };
        if client_id.len() > 128 {
            return Err(DevToolboxError::InvalidArgument(
                "client id must be at most 128 characters".to_string(),
            ));
        }

        let mut options = MqttOptions::new(client_id, host, port);
        options.set_keep_alive(std::time::Duration::from_secs(
            keep_alive_secs.clamp(5, 300) as u64,
        ));
        if tls {
            options.set_transport(Transport::tls_with_default_config());
        }
        if let Some(username) = username.filter(|value| !value.is_empty()) {
            options.set_credentials(username, password.unwrap_or(""));
        }

        let (client, mut eventloop) = AsyncClient::new(options, 64);
        let session_id = uuid::Uuid::new_v4().to_string();
        let emit = self.emit.clone();
        let sid = session_id.clone();

        let task = tokio::spawn(async move {
            loop {
                match eventloop.poll().await {
                    Ok(Event::Incoming(Incoming::ConnAck(_))) => {
                        emit_event(&emit, MqttEvent::new(&sid, "connected"));
                    }
                    Ok(Event::Incoming(Incoming::SubAck(ack))) => {
                        let mut event = MqttEvent::new(&sid, "subscribed");
                        event.message = Some(format!(
                            "subscription acknowledged ({:?})",
                            ack.return_codes
                        ));
                        emit_event(&emit, event);
                    }
                    Ok(Event::Incoming(Incoming::Publish(publish))) => {
                        let mut event = MqttEvent::new(&sid, "message");
                        event.topic = Some(publish.topic);
                        event.payload = Some(String::from_utf8_lossy(&publish.payload).to_string());
                        event.retain = Some(publish.retain);
                        event.qos = Some(match publish.qos {
                            QoS::AtMostOnce => 0,
                            QoS::AtLeastOnce => 1,
                            QoS::ExactlyOnce => 2,
                        });
                        emit_event(&emit, event);
                    }
                    Ok(Event::Incoming(Incoming::Disconnect)) => {
                        emit_event(&emit, MqttEvent::new(&sid, "disconnected"));
                        break;
                    }
                    Ok(_) => {}
                    Err(err) => {
                        let mut event = MqttEvent::new(&sid, "error");
                        event.message = Some(err.to_string());
                        emit_event(&emit, event);
                        break;
                    }
                }
            }
        });

        self.sessions
            .lock()
            .map_err(|_| DevToolboxError::Internal("MQTT session lock poisoned".to_string()))?
            .insert(
                session_id.clone(),
                Session {
                    client,
                    task,
                    broker: broker.to_string(),
                },
            );

        Ok(session_id)
    }

    pub async fn subscribe(
        &self,
        session_id: &str,
        topic: &str,
        qos: Option<u8>,
    ) -> Result<(), DevToolboxError> {
        let topic = validate_topic(topic)?;
        let qos = parse_qos(qos)?;
        self.session(session_id)?
            .subscribe(topic, qos)
            .await
            .map_err(|err| DevToolboxError::Internal(format!("subscribe failed: {err}")))
    }

    pub async fn publish(
        &self,
        session_id: &str,
        topic: &str,
        payload: &str,
        qos: Option<u8>,
        retain: bool,
    ) -> Result<(), DevToolboxError> {
        let topic = validate_topic(topic)?;
        if payload.len() > MAX_PAYLOAD_BYTES {
            return Err(DevToolboxError::InvalidArgument(
                "payload is larger than 256 KiB".to_string(),
            ));
        }
        self.session(session_id)?
            .publish(topic, parse_qos(qos)?, retain, payload.as_bytes())
            .await
            .map_err(|err| DevToolboxError::Internal(format!("publish failed: {err}")))
    }

    pub async fn disconnect(&self, session_id: &str) -> Result<(), DevToolboxError> {
        let session = self
            .sessions
            .lock()
            .map_err(|_| DevToolboxError::Internal("MQTT session lock poisoned".to_string()))?
            .remove(session_id)
            .ok_or_else(|| {
                DevToolboxError::NotFound(format!("unknown MQTT session '{session_id}'"))
            })?;

        let _ = session.client.disconnect().await;
        session.task.abort();
        Ok(())
    }

    pub fn list(&self) -> Vec<MqttSessionInfo> {
        let Ok(sessions) = self.sessions.lock() else {
            return Vec::new();
        };
        let mut items: Vec<MqttSessionInfo> = sessions
            .iter()
            .map(|(session_id, session)| MqttSessionInfo {
                session_id: session_id.clone(),
                broker: session.broker.clone(),
            })
            .collect();
        items.sort_by(|a, b| a.session_id.cmp(&b.session_id));
        items
    }
}

fn emit_event(emit: &EventSink, event: MqttEvent) {
    if let Ok(value) = serde_json::to_value(&event) {
        emit(value);
    }
}

/// Exposed for tests: validate a broker URL without connecting.
pub fn validate_broker(raw: &str) -> Result<String, DevToolboxError> {
    let (host, port, tls) = parse_broker(raw)?;
    Ok(format!(
        "{}://{host}:{port}",
        if tls { "mqtts" } else { "mqtt" }
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    fn manager() -> MqttManager {
        MqttManager::new(Arc::new(|_| {}))
    }

    #[test]
    fn parses_broker_urls() {
        assert_eq!(
            validate_broker("mqtt://localhost").unwrap(),
            "mqtt://localhost:1883"
        );
        assert_eq!(
            validate_broker("mqtts://broker.example.com:8883").unwrap(),
            "mqtts://broker.example.com:8883"
        );
        assert_eq!(
            parse_broker("mqtt://127.0.0.1:1884").unwrap(),
            ("127.0.0.1".into(), 1884, false)
        );
    }

    #[test]
    fn rejects_invalid_broker_urls() {
        for url in [
            "http://localhost",
            "ws://localhost",
            "mqtt://user:pass@localhost",
            "mqtt://localhost/path",
            "not a url",
            "mqtt://",
        ] {
            assert!(validate_broker(url).is_err(), "{url}");
        }
    }

    #[test]
    fn validates_topics_and_qos() {
        assert!(validate_topic("sensors/+/temp").is_ok());
        assert!(validate_topic("").is_err());
        assert!(validate_topic(&"x".repeat(600)).is_err());
        assert!(parse_qos(Some(0)).is_ok());
        assert!(parse_qos(Some(2)).is_ok());
        assert!(parse_qos(Some(3)).is_err());
    }

    #[test]
    fn session_operations_require_a_connection() {
        let manager = manager();
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        assert_eq!(
            runtime
                .block_on(manager.publish("missing", "t", "p", Some(0), false))
                .unwrap_err()
                .code(),
            "not_found"
        );
        assert_eq!(
            runtime
                .block_on(manager.disconnect("missing"))
                .unwrap_err()
                .code(),
            "not_found"
        );
        assert!(manager.list().is_empty());
    }
}
