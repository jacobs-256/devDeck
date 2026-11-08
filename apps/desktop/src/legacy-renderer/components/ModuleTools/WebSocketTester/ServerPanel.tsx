// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './ServerPanel.module.css';
import { useI18n } from '../../../i18n';

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
  const { locale } = useI18n();
  const tr = (en: string, zh: string) => (locale === 'zh-CN' ? zh : en);
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
      <section className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}> {tr('Connection', '连接')} </div>
          <span className={`${styles.statusChip}${running ? ` ${styles.statusOn}` : ''}`}>
            <i className={styles.statusDot} />
            {running ? tr('Running', '运行中') : tr('Stopped', '已停止')}
          </span>
        </div>

        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>{tr('Host', '主机')}</span>
            <input className={styles.input} value={host} onChange={(e) => setHost(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>{tr('Port', '端口')}</span>
            <input className={styles.input} value={port} onChange={(e) => setPort(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>{tr('Path', '路径')}</span>
            <input className={styles.input} value={path} onChange={(e) => setPath(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>{tr('TLS', 'TLS')}</span>
            <select
              className={styles.select}
              value={tls ? '1' : '0'}
              onChange={(e) => setTls(e.target.value === '1')}
            >
              <option value="0">{tr('Off', '关闭')}</option>
              <option value="1">{tr('On', '开启')}</option>
            </select>
          </label>
        </div>

        {tls ? (
          <div className={styles.certRow}>
            <button
              className={styles.btn}
              onClick={() =>
                void pickPem()
                  .then(setCertPem)
                  .catch((e) => setError(e.message))
              }
              disabled={running}
            >
              {tr('Load cert', '加载证书')}
            </button>
            <button
              className={styles.btn}
              onClick={() =>
                void pickPem()
                  .then(setKeyPem)
                  .catch((e) => setError(e.message))
              }
              disabled={running}
            >
              {tr('Load key', '加载私钥')}
            </button>
            <span className={styles.certState}>
              {certPem ? tr('Cert loaded', '证书已加载') : tr('Cert missing', '缺少证书')} ·{' '}
              {keyPem ? tr('Key loaded', '私钥已加载') : tr('Key missing', '缺少私钥')}
            </span>
          </div>
        ) : null}

        <div className={styles.actionRow}>
          <button className={`${styles.btn} ${styles.primary}`} onClick={start} disabled={startDisabled}>
            {tr('Start', '启动')}
          </button>
          <button className={`${styles.btn} ${styles.danger}`} onClick={stop} disabled={!running}>
            {tr('Stop', '停止')}
          </button>
          <span className={styles.endpoint} title={running ? status.url : undefined}>
            {running
              ? status.url || `${tls ? 'wss' : 'ws'}://${host}:${port}${path}`
              : tr('Not listening', '未监听')}
          </span>
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaChip}>
            {tr('Clients', '客户端')} <b>{clients.length}</b>
          </span>
          <span className={styles.metaChip}>
            {tr('Sent', '已发送')} <b>{status.stats.totalSent}</b>
          </span>
          <span className={styles.metaChip}>
            {tr('Recv', '已接收')} <b>{status.stats.totalRecv}</b>
          </span>
        </div>
      </section>

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <details className={styles.stressCard}>
        <summary className={styles.stressSummary}>
          <span>{tr('Load test', '负载测试')}</span>
          <span className={`${styles.stressState}${stressEnabled ? ` ${styles.stressStateOn}` : ''}`}>
            {stressEnabled ? tr('Running', '运行中') : tr('Idle', '空闲')}
          </span>
        </summary>
        <div className={styles.stressBody}>
          <label className={styles.inlineField}>
            <span>{tr('Interval', '间隔')}</span>
            <input
              className={styles.smallInput}
              value={stressIntervalMs}
              onChange={(e) => setStressIntervalMs(e.target.value)}
            />
            <em>{tr('ms', '毫秒')}</em>
          </label>
          <label className={styles.inlineField}>
            <span>{tr('Payload', '载荷')}</span>
            <input
              className={styles.smallInput}
              value={stressPayloadBytes}
              onChange={(e) => setStressPayloadBytes(e.target.value)}
            />
            <em>{tr('bytes', '字节')}</em>
          </label>
          <button
            className={`${styles.btn}${stressEnabled ? ` ${styles.danger}` : ''}`}
            onClick={toggleStress}
            disabled={!running}
          >
            {stressEnabled ? tr('Stop', '停止') : tr('Start', '开始')}
          </button>
          <p className={styles.stressHint}>
            {tr('Broadcast a fixed-size payload to all clients.', '向所有客户端广播固定大小的载荷。')}
          </p>
        </div>
      </details>

      <section className={`${styles.card} ${styles.logCard}`}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitle}>
            {tr('Server log', '服务端日志')} <span className={styles.count}>{logs.length}</span>
          </div>
          <button className={styles.textBtn} onClick={() => setLogs([])} disabled={logs.length === 0}>
            {tr('Clear', '清空')}
          </button>
        </div>
        <div className={styles.logArea} role="log" aria-live="polite">
          {logs.length === 0 ? (
            <div className={styles.outputEmpty}>{tr('No server events yet.', '暂无服务端事件')}</div>
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
          <select
            className={styles.targetSelect}
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            aria-label={tr('Send target', '发送目标')}
          >
            <option value="broadcast">{tr('Broadcast', '广播')}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.remote} · {c.id.slice(0, 6)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.composerRow}>
          <input
            className={styles.payloadInput}
            value={broadcastText}
            onChange={(e) => setBroadcastText(e.target.value)}
            placeholder={tr('Payload (text/JSON)', '载荷（文本/JSON）')}
          />
          <button className={`${styles.btn} ${styles.primary}`} onClick={send} disabled={!running}>
            {tr('Send', '发送')}
          </button>
          <button
            className={styles.btn}
            onClick={kick}
            disabled={!running || selectedClientId === 'broadcast'}
          >
            {tr('Kick', '断开')}
          </button>
        </div>
      </section>
    </div>
  );
}
