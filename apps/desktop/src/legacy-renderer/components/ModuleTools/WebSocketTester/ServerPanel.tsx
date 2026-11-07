// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ServerPanel.module.css';

type ClientInfo = {
  id: string;
  remote: string;
  connectedAt: string;
  recvCount: number;
  sentCount: number;
};

type ServerStatus = {
  running: boolean;
  url: string;
  tls: boolean;
  clients: ClientInfo[];
  stats: { totalRecv: number; totalSent: number };
};

type WsServerEvent =
  | { type: 'log'; level: 'info' | 'error'; message: string }
  | { type: 'status'; status: ServerStatus };

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

function isElectronApi(): boolean {
  return Boolean(window.electronAPI);
}

export default function ServerPanel() {
  const [host, setHost] = useState('0.0.0.0');
  const [port, setPort] = useState('8080');
  const [path, setPath] = useState('/ws');
  const [tls, setTls] = useState(false);
  const [certPem, setCertPem] = useState('');
  const [keyPem, setKeyPem] = useState('');

  const [broadcastText, setBroadcastText] = useState('{"type":"pong"}');
  const [selectedClientId, setSelectedClientId] = useState<string>('broadcast');

  const [stressEnabled, setStressEnabled] = useState(false);
  const [stressIntervalMs, setStressIntervalMs] = useState('1000');
  const [stressPayloadBytes, setStressPayloadBytes] = useState('64');

  const [status, setStatus] = useState<ServerStatus>({
    running: false,
    url: '',
    tls: false,
    clients: [],
    stats: { totalRecv: 0, totalSent: 0 },
  });
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);

  const pollTimerRef = useRef<number | null>(null);
  const eventHandlerRef = useRef<unknown>(null);

  const clients = status.clients;
  const running = status.running;

  const startDisabled = useMemo(() => {
    if (!isElectronApi()) return true;
    if (running) return true;
    const p = Number(port);
    if (!Number.isFinite(p) || p <= 0 || p > 65535) return true;
    if (tls && (!certPem.trim() || !keyPem.trim())) return true;
    return false;
  }, [port, running, tls, certPem, keyPem]);

  const refreshStatus = async () => {
    const api = window.electronAPI;
    if (!api?.wsServerStatus) return;
    try {
      const s = await api.wsServerStatus();
      setStatus(s);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const start = async () => {
    setError('');
    const api = window.electronAPI;
    if (!api?.wsServerStart) {
      setError('wsServerStart not available');
      return;
    }
    try {
      await api.wsServerStart({
        host: host.trim(),
        port: Number(port),
        path: path.trim() || '/',
        tls,
        certPem: certPem.trim() || undefined,
        keyPem: keyPem.trim() || undefined,
      });
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stop = async () => {
    setError('');
    const api = window.electronAPI;
    if (!api?.wsServerStop) return;
    try {
      await api.wsServerStop();
      setStressEnabled(false);
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pickPem = async (): Promise<string> => {
    const api = window.electronAPI;
    if (!api?.openFile) throw new Error('openFile not available');
    const picked = await api.openFile([{ name: 'PEM', extensions: ['pem', 'crt', 'key'] }], 'utf8');
    if (!picked?.content) throw new Error('No file selected');
    return picked.content;
  };

  const send = async () => {
    setError('');
    const api = window.electronAPI;
    if (!api?.wsServerSend) return;
    const data = broadcastText;
    if (!data) return;
    try {
      if (selectedClientId === 'broadcast') await api.wsServerSend({ broadcast: true, data });
      else await api.wsServerSend({ clientId: selectedClientId, data });
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const kick = async () => {
    setError('');
    const api = window.electronAPI;
    if (!api?.wsServerKick) return;
    if (!selectedClientId || selectedClientId === 'broadcast') return;
    try {
      await api.wsServerKick({ clientId: selectedClientId });
      await refreshStatus();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleStress = async () => {
    setError('');
    const api = window.electronAPI;
    if (!api?.wsServerStressStart || !api?.wsServerStressStop) return;
    try {
      if (stressEnabled) {
        await api.wsServerStressStop();
        setStressEnabled(false);
      } else {
        const ms = Math.max(10, Math.min(60000, Math.floor(Number(stressIntervalMs) || 1000)));
        const bytes = Math.max(1, Math.min(65536, Math.floor(Number(stressPayloadBytes) || 64)));
        await api.wsServerStressStart({ intervalMs: ms, payloadBytes: bytes });
        setStressEnabled(true);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      await refreshStatus();
    }
  };

  useEffect(() => {
    if (!isElectronApi()) return;
    const api = window.electronAPI;
    if (api?.onWsServerEvent) {
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
          return next.length > 800 ? next.slice(next.length - 800) : next;
        });
      };
      const handler = (ev: WsServerEvent) => {
        if (!ev) return;
        if (ev.type === 'log') pushLog(ev.level, ev.message);
        if (ev.type === 'status') setStatus(ev.status);
      };
      eventHandlerRef.current = api.onWsServerEvent(handler);
    }
    void refreshStatus();
    pollTimerRef.current = window.setInterval(() => void refreshStatus(), 1000);
    return () => {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
      if (api?.offWsServerEvent && eventHandlerRef.current) api.offWsServerEvent(eventHandlerRef.current);
      eventHandlerRef.current = null;
    };
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.inputBar}>
        <div className={styles.label}>Host</div>
        <input className={styles.textInput} value={host} onChange={(e) => setHost(e.target.value)} />
        <div className={styles.label}>Port</div>
        <input className={styles.textInput} value={port} onChange={(e) => setPort(e.target.value)} />
        <div className={styles.label}>Path</div>
        <input
          className={`${styles.textInput} ${styles.wideInput}`}
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />

        <div className={styles.label}>TLS</div>
        <select
          className={styles.select}
          value={tls ? '1' : '0'}
          onChange={(e) => setTls(e.target.value === '1')}
        >
          <option value="0">Off</option>
          <option value="1">On</option>
        </select>

        <button
          className={`${styles.actionBtn} ${styles.primaryBtn}`}
          onClick={start}
          disabled={startDisabled}
        >
          Start
        </button>
        <button className={`${styles.actionBtn} ${styles.stopBtn}`} onClick={stop} disabled={!running}>
          Stop
        </button>

        <span className={styles.badge}>{running ? `Running: ${status.url}` : 'Stopped'}</span>
        <span className={styles.badge}>Clients: {clients.length}</span>
        <span className={styles.badge}>
          Sent: {status.stats.totalSent} · Recv: {status.stats.totalRecv}
        </span>
        <span className={styles.badge}>Protocol debugging</span>
      </div>

      {tls ? (
        <div className={styles.inputBar}>
          <button
            className={styles.actionBtn}
            onClick={() =>
              void pickPem()
                .then(setCertPem)
                .catch((e) => setError(e.message))
            }
            disabled={running}
          >
            Load Cert
          </button>
          <button
            className={styles.actionBtn}
            onClick={() =>
              void pickPem()
                .then(setKeyPem)
                .catch((e) => setError(e.message))
            }
            disabled={running}
          >
            Load Key
          </button>
          <span className={styles.hint}>
            {certPem ? 'Cert loaded' : 'Cert missing'} · {keyPem ? 'Key loaded' : 'Key missing'}
          </span>
        </div>
      ) : null}

      {error ? (
        <div className={styles.inputBar}>
          <div className={styles.hint} style={{ color: 'var(--color-error, #e74c3c)' }}>
            {error}
          </div>
        </div>
      ) : null}

      <div className={styles.outputArea}>
        {logs.length === 0 ? (
          <div className={styles.outputEmpty}>No logs.</div>
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
        <div className={styles.label}>Target</div>
        <select
          className={styles.select}
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
        >
          <option value="broadcast">Broadcast</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.remote} · {c.id.slice(0, 6)}
            </option>
          ))}
        </select>
        <input
          className={`${styles.textInput} ${styles.wideInput}`}
          value={broadcastText}
          onChange={(e) => setBroadcastText(e.target.value)}
          placeholder="Payload (text/JSON)"
        />
        <button className={`${styles.actionBtn} ${styles.primaryBtn}`} onClick={send} disabled={!running}>
          Send Frame
        </button>
        <button
          className={styles.actionBtn}
          onClick={kick}
          disabled={!running || selectedClientId === 'broadcast'}
        >
          Kick
        </button>
        <button className={styles.actionBtn} onClick={() => setLogs([])}>
          Clear
        </button>
      </div>

      <div className={styles.row}>
        <div className={styles.label}>Stress</div>
        <input
          className={styles.textInput}
          value={stressIntervalMs}
          onChange={(e) => setStressIntervalMs(e.target.value)}
          placeholder="interval ms"
        />
        <input
          className={styles.textInput}
          value={stressPayloadBytes}
          onChange={(e) => setStressPayloadBytes(e.target.value)}
          placeholder="payload bytes"
        />
        <button className={styles.actionBtn} onClick={toggleStress} disabled={!running}>
          {stressEnabled ? 'Stop' : 'Start'}
        </button>
        <span className={styles.hint}>Broadcast a fixed-size payload to all clients</span>
      </div>
    </div>
  );
}
