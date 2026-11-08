// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import styles from './ClientPanel.module.css';
import { useI18n } from '../../../i18n';

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
  const { locale } = useI18n();
  const tr = (en: string, zh: string) => (locale === 'zh-CN' ? zh : en);
  const [url, setUrl] = useState('ws://127.0.0.1:8080/ws');
  const [message, setMessage] = useState('{"type":"ping"}');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);

  const wsRef = useRef<WebSocket | null>(null);

  const statusText = connected ? tr('Connected', '已连接') : tr('Disconnected', '未连接');

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
      setError(tr('Missing URL', '缺少 URL'));
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
      setError(tr('WebSocket is not connected', 'WebSocket 未连接'));
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
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>{tr('Connection', '连接')}</div>
          <span className={`${styles.statusChip}${connected ? ` ${styles.statusOn}` : ''}`}>
            <i className={styles.statusDot} />
            {statusText}
          </span>
        </div>
        <div className={styles.urlRow}>
          <input
            className={styles.urlInput}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="ws://host:port/path"
            spellCheck={false}
          />
          <button className={`${styles.btn} ${styles.primary}`} onClick={connect} disabled={connected}>
            {tr('Connect', '连接')}
          </button>
          <button className={`${styles.btn} ${styles.danger}`} onClick={disconnect} disabled={!connected}>
            {tr('Disconnect', '断开')}
          </button>
        </div>
      </section>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <section className={`${styles.card} ${styles.logCard}`}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>
            {tr('Frames', '帧')} <span className={styles.count}>{logs.length}</span>
          </div>
          <button className={styles.textBtn} onClick={() => setLogs([])} disabled={logs.length === 0}>
            {tr('Clear', '清空')}
          </button>
        </div>
        <div className={styles.logArea} role="log" aria-live="polite">
          {logs.length === 0 ? (
            <div className={styles.outputEmpty}>{tr('No frames yet.', '暂无帧')}</div>
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
      </section>

      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>{tr('Send frame', '发送帧')}</div>
        </div>
        <div className={styles.composerRow}>
          <input
            className={styles.msgInput}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={tr('Payload (text/JSON)', '载荷（文本/JSON）')}
            spellCheck={false}
          />
          <button className={`${styles.btn} ${styles.primary}`} onClick={send} disabled={!connected}>
            {tr('Send', '发送')}
          </button>
        </div>
      </section>
    </div>
  );
}
