//! End-to-end SSH tests against an in-process russh server.
//!
//! These exercise the real handshake, TOFU host-key pinning, password auth,
//! shell echo, exec, and disconnect paths — everything the production client
//! uses, without touching the network.

use std::net::SocketAddr;
use std::sync::mpsc as std_mpsc;
use std::sync::Arc;
use std::time::{Duration, Instant};

use russh::server::{Auth, ChannelOpenHandle, Handler, Msg, Server, Session};
use russh::{ChannelId, Pty};
use serde_json::Value;
use tokio::net::TcpListener;

use super::*;

struct TestServer;

impl Server for TestServer {
    type Handler = TestHandler;

    fn new_client(&mut self, _peer: Option<SocketAddr>) -> TestHandler {
        TestHandler
    }
}

struct TestHandler;

impl Handler for TestHandler {
    type Error = russh::Error;

    async fn auth_password(&mut self, _user: &str, password: &str) -> Result<Auth, Self::Error> {
        Ok(if password == "secret" {
            Auth::Accept
        } else {
            Auth::reject()
        })
    }

    async fn channel_open_session(
        &mut self,
        _channel: russh::Channel<Msg>,
        reply: ChannelOpenHandle,
        _session: &mut Session,
    ) -> Result<(), Self::Error> {
        reply.accept().await;
        Ok(())
    }

    async fn pty_request(
        &mut self,
        channel: ChannelId,
        _term: &str,
        _cols: u32,
        _rows: u32,
        _pix_width: u32,
        _pix_height: u32,
        _modes: &[(Pty, u32)],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.channel_success(channel)?;
        Ok(())
    }

    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.channel_success(channel)?;
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.channel_success(channel)?;
        let command = String::from_utf8_lossy(data);
        session.data(channel, format!("ran: {command}\n"))?;
        session.exit_status_request(channel, 0)?;
        session.close(channel)?;
        Ok(())
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.data(channel, data.to_vec())?;
        Ok(())
    }

    async fn subsystem_request(
        &mut self,
        channel: ChannelId,
        _name: &str,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.channel_failure(channel)?;
        Ok(())
    }
}

async fn start_server() -> (SocketAddr, tokio::task::JoinHandle<()>) {
    let mut rng = russh::keys::key::safe_rng();
    let key = russh::keys::PrivateKey::random(&mut rng, russh::keys::Algorithm::Ed25519)
        .expect("test host key");
    let config = Arc::new(russh::server::Config {
        keys: vec![key.clone()],
        ..Default::default()
    });

    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let addr = listener.local_addr().expect("addr");
    drop(listener);

    let mut server = TestServer;
    let task = tokio::spawn(async move {
        let _ = server.run_on_address(config, addr).await;
    });

    tokio::time::sleep(Duration::from_millis(150)).await;
    (addr, task)
}

fn sink() -> (EventSink, std_mpsc::Receiver<Value>) {
    let (tx, rx) = std_mpsc::channel::<Value>();
    let sink: EventSink = Arc::new(move |value| {
        let _ = tx.send(value);
    });
    (sink, rx)
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
    panic!("timed out waiting for SSH event");
}

fn params(port: u16, password: &str) -> ConnectParams {
    ConnectParams {
        host: "127.0.0.1".to_string(),
        port,
        username: "tester".to_string(),
        password: Some(password.to_string()),
        private_key: None,
        passphrase: None,
        session_id: None,
        terminal_id: None,
        cols: None,
        rows: None,
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn ssh_shell_exec_and_host_key_pinning_end_to_end() {
    let (addr, server) = start_server().await;
    let dir = tempfile::tempdir().unwrap();
    let known_hosts_path = dir.path().join("known-hosts.json");
    let known = KnownHosts::open(&known_hosts_path).unwrap();
    let (emit, events) = sink();
    let manager = SshManager::new(known, emit);
    let plugin = PluginId::new("market-ssh-e2e").unwrap();

    // Wrong password is rejected.
    let rejected = manager.connect(&plugin, params(addr.port(), "wrong")).await;
    assert!(rejected.is_err(), "wrong password should fail");

    // Correct password succeeds and pins the host key.
    let session = manager
        .connect(&plugin, params(addr.port(), "secret"))
        .await
        .expect("password auth");
    assert!(!session.fingerprint.is_empty());
    assert!(known_hosts_path.exists(), "host key should be persisted");

    // Shell: write to the channel and receive the echoed bytes.
    let channel = manager
        .open_shell(&plugin, &session.session_id, 80, 24, "xterm", None)
        .await
        .expect("open shell");
    manager
        .write(&plugin, &session.session_id, &channel, b"hello\n".to_vec())
        .expect("write");
    let echoed = wait_for(
        &events,
        |value| value["event"] == "data" && value["text"] == "hello\n",
        Duration::from_secs(5),
    );
    assert_eq!(echoed["channelId"], channel.as_str());

    // Exec: command output and exit status arrive on a separate channel.
    let exec = manager
        .exec(&plugin, &session.session_id, "echo hi", Some("exec-1"))
        .await
        .expect("exec");
    assert_eq!(exec, "exec-1");
    let output = wait_for(
        &events,
        |value| value["event"] == "data" && value["channelId"] == "exec-1",
        Duration::from_secs(5),
    );
    assert!(output["text"]
        .as_str()
        .unwrap_or("")
        .contains("ran: echo hi"));
    let exit = wait_for(
        &events,
        |value| value["event"] == "exit" && value["channelId"] == "exec-1",
        Duration::from_secs(5),
    );
    assert_eq!(exit["code"], 0);

    // Disconnecting removes the session.
    manager
        .disconnect(&plugin, &session.session_id)
        .await
        .expect("disconnect");
    assert!(manager.list(&plugin).is_empty());

    server.abort();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn host_key_change_is_refused() {
    let (addr, server) = start_server().await;
    let dir = tempfile::tempdir().unwrap();
    let known = KnownHosts::open(dir.path().join("known-hosts.json")).unwrap();
    let (emit, _events) = sink();
    let manager = SshManager::new(known, emit);
    let plugin = PluginId::new("market-ssh-e2e").unwrap();

    manager
        .connect(&plugin, params(addr.port(), "secret"))
        .await
        .expect("first connection pins the key");

    // Replace the pinned fingerprint with a bogus one, as if the server rotated
    // its key without the user's knowledge.
    let known_path = dir.path().join("known-hosts.json");
    let mut file: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&known_path).unwrap()).unwrap();
    for host in file["hosts"].as_object_mut().unwrap().values_mut() {
        host["fingerprint"] = serde_json::Value::String("SHA256:bogus".to_string());
    }
    std::fs::write(&known_path, serde_json::to_vec(&file).unwrap()).unwrap();

    let known = KnownHosts::open(&known_path).unwrap();
    let (emit, _events) = sink();
    let manager = SshManager::new(known, emit);
    let error = manager
        .connect(&plugin, params(addr.port(), "secret"))
        .await
        .expect_err("changed host key must be refused");
    assert_eq!(error.code(), "permission_denied");

    server.abort();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn sftp_requires_a_server_that_supports_it() {
    let (addr, server) = start_server().await;
    let dir = tempfile::tempdir().unwrap();
    let known = KnownHosts::open(dir.path().join("known-hosts.json")).unwrap();
    let (emit, _events) = sink();
    let manager = SshManager::new(known, emit);
    let plugin = PluginId::new("market-ssh-e2e").unwrap();

    let session = manager
        .connect(&plugin, params(addr.port(), "secret"))
        .await
        .expect("connect");

    // Our test server rejects the sftp subsystem, so listing must fail cleanly
    // instead of hanging or panicking.
    let error = manager
        .sftp_list(&plugin, &session.session_id, "/")
        .await
        .expect_err("sftp should be unavailable");
    assert!(error.to_string().to_lowercase().contains("sftp"));

    manager
        .disconnect(&plugin, &session.session_id)
        .await
        .expect("disconnect");
    server.abort();
}
