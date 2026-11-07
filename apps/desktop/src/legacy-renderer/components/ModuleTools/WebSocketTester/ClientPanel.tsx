// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ClientPanel.module.css';

type LogKind = 'system' | 'send' | 'recv' | 'error';
type LogItem = { ts: string; level: 'info' | 'error'; kind: LogKind; text: string };

function nowText(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export default function ClientPanel() {
  const [url, setUrl] = useState('ws://127.0.0.1:8080/ws');
  const [message, setMessage] = useState('{"type":"ping"}');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  const statusText = useMemo(() => (connected ? 'Connected' : 'Disconnected'), [connected]);

  const classifyLog = (level: LogItem['level'], text: string): LogKind => {
    if (level === 'error') return 'error';
    const t = text.trim().toLowerCase();
    if (t.startsWith('recv')) return 'recv';
    if (t.startsWith('send')) return 'send';
    return 'system';
  };

  const pushLog = (level: LogItem['level'], text: string) => {
    setLogs((prev) => {
      const next = [...prev, { ts: nowText(), level, kind: classifyLog(level, text), text }];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  };

  const disconnect = () => {
    setError('');
    try {
      wsRef.current?.close(1000, 'client disconnect');
    } catch {
      void 0;
    }
    wsRef.current = null;
    setConnected(false);
  };

  const connect = () => {
    setError('');
    const u = url.trim();
    if (!u) {
      setError('Missing URL');
      return;
    }
    disconnect();
    let ws: WebSocket;
    try {
      ws = new WebSocket(u);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    wsRef.current = ws;
    pushLog('info', `connect: ${u}`);

    ws.onopen = () => {
      setConnected(true);
      pushLog('info', 'open');
    };
    ws.onclose = (ev) => {
      setConnected(false);
      pushLog('info', `close: code=${ev.code} reason=${ev.reason || '-'}`);
    };
    ws.onerror = () => {
      pushLog('error', 'error');
    };
    ws.onmessage = (ev) => {
      const data = typeof ev.data === 'string' ? ev.data : '[binary]';
      pushLog('info', `recv frame: ${data}`);
    };
  };

  const send = () => {
    setError('');
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('WebSocket is not connected');
      return;
    }
    try {
      ws.send(message);
      pushLog('info', `send frame: ${message}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.inputBar}>
        <div className={styles.label}>URL</div>
        <input
          className={styles.textInput}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="ws://host:port/path"
        />
        <button className={`${styles.actionBtn} ${styles.primaryBtn}`} onClick={connect} disabled={connected}>
          Connect
        </button>
        <button
          className={`${styles.actionBtn} ${styles.stopBtn}`}
          onClick={disconnect}
          disabled={!connected}
        >
          Disconnect
        </button>
        <div className={styles.hint}>{statusText} · Protocol debugging</div>
      </div>

      {error ? (
        <div className={styles.inputBar}>
          <div className={styles.hint} style={{ color: 'var(--color-error, #e74c3c)' }}>
            {error}
          </div>
        </div>
      ) : null}

      <div className={styles.outputArea}>
        {logs.length === 0 ? (
          <div className={styles.outputEmpty}>No frames.</div>
        ) : (
          <div className={styles.logList}>
            {logs.map((l, idx) => (
              <div
                key={`${l.ts}_${idx}`}
                className={`${styles.logLine} ${
                  l.kind === 'recv'
                    ? styles.logRecv
                    : l.kind === 'send'
                      ? styles.logSend
                      : l.kind === 'error'
                        ? styles.logError
                        : styles.logSystem
                }`}
              >
                <span className={styles.logTs}>{l.ts}</span>
                <span className={styles.logLv}>{l.level.toUpperCase()}</span>
                <span className={styles.logMsg}>{l.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.row}>
        <input
          className={styles.msgInput}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Payload (text/JSON)"
        />
        <button className={`${styles.actionBtn} ${styles.primaryBtn}`} onClick={send} disabled={!connected}>
          Send Frame
        </button>
        <button className={styles.actionBtn} onClick={() => setLogs([])}>
          Clear
        </button>
      </div>
    </div>
  );
}
