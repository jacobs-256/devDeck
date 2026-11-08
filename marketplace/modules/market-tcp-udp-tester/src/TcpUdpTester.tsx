import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './TcpUdpTester.module.css';
import { sdk } from './sdk';
import type { EndpointConfig, NetProtocol } from './types';

type TabId = 'server' | 'client' | 'endpoints';
type Encoding = 'utf8' | 'hex' | 'base64';

const ENDPOINTS_KEY = 'tcpudp.endpoints.v1';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function newId(): string {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeHost(v: string): string {
  return v.trim();
}

function normalizePort(v: unknown): number {
  const n = Math.floor(asNumber(v, 0));
  if (!n || n < 1 || n > 65535) return 0;
  return n;
}

function parseEndpoints(v: unknown): EndpointConfig[] {
  if (!Array.isArray(v)) return [];
  const out: EndpointConfig[] = [];
  v.forEach((item) => {
    if (!isRecord(item)) return;
    const id = asString(item.id).trim();
    const name = asString(item.name).trim();
    const protocol = asString(item.protocol) === 'udp' ? 'udp' : 'tcp';
    const host = normalizeHost(asString(item.host));
    const port = normalizePort(item.port);
    if (!id || !name || !host || !port) return;
    out.push({ id, name, protocol, host, port });
  });
  return out;
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function TcpUdpTester() {
  const [tab, setTab] = useState<TabId>('server');

  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [serverEndpointId, setServerEndpointId] = useState<string>('');
  const [clientEndpointId, setClientEndpointId] = useState<string>('');

  const [serverProtocol, setServerProtocol] = useState<NetProtocol>('tcp');
  const [serverHost, setServerHost] = useState('0.0.0.0');
  const [serverPort, setServerPort] = useState<number>(9000);

  const [clientProtocol, setClientProtocol] = useState<NetProtocol>('tcp');
  const [clientHost, setClientHost] = useState('127.0.0.1');
  const [clientPort, setClientPort] = useState<number>(9000);

  const [serverStatus, setServerStatus] = useState<unknown>(null);
  const [clientStatus, setClientStatus] = useState<unknown>(null);

  const [serverSendEncoding, setServerSendEncoding] = useState<Encoding>('utf8');
  const [serverSendPayload, setServerSendPayload] = useState('');
  const [serverSendRemote, setServerSendRemote] = useState('');
  const [serverSendConnId, setServerSendConnId] = useState('');

  const [clientSendEncoding, setClientSendEncoding] = useState<Encoding>('utf8');
  const [clientSendPayload, setClientSendPayload] = useState('');

  const [logs, setLogs] = useState<string[]>([]);
  const logBoxRef = useRef<HTMLDivElement | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EndpointConfig | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftProtocol, setDraftProtocol] = useState<NetProtocol>('tcp');
  const [draftHost, setDraftHost] = useState('');
  const [draftPort, setDraftPort] = useState<number>(0);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const serverConnections = useMemo(() => {
    if (!isRecord(serverStatus)) return [];
    const list = serverStatus.connections;
    if (!Array.isArray(list)) return [];
    return list
      .map((x) => (isRecord(x) ? { id: asString(x.id).trim(), remote: asString(x.remote).trim() } : null))
      .filter((x): x is { id: string; remote: string } => Boolean(x && x.id));
  }, [serverStatus]);

  const serverLastRemote = useMemo(() => {
    if (!isRecord(serverStatus)) return '';
    return asString(serverStatus.lastRemote).trim();
  }, [serverStatus]);

  const appendLog = (line: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    setLogs((prev) => {
      const next = [...prev, `[${ts}] ${line}`];
      return next.length > 1000 ? next.slice(next.length - 1000) : next;
    });
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      const el = logBoxRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    }, 0);
    return () => window.clearTimeout(t);
  }, [logs.length]);

  useEffect(() => {
    void (async () => {
      const res = await sdk.storage.get(ENDPOINTS_KEY);
      if (res.ok) setEndpoints(parseEndpoints(res.data));
    })();
  }, []);

  useEffect(() => {
    const off = sdk.socket.onEvent((ev) => {
      if (!isRecord(ev)) {
        appendLog(stringify(ev));
        return;
      }

      const type = asString(ev.type);
      const target = asString(ev.target);
      if (type === 'status') {
        if (target === 'server') setServerStatus(ev.status);
        else if (target === 'client') setClientStatus(ev.status);
        return;
      }

      if (type === 'log') {
        const level = asString(ev.level).toUpperCase() || 'INFO';
        appendLog(`${target} ${level} ${asString(ev.message)}`);
        return;
      }

      if (type === 'data') {
        const data = ev.data;
        if (!isRecord(data)) {
          appendLog(`${target} DATA ${stringify(ev)}`);
          return;
        }
        const direction = asString(data.direction);
        const protocol = asString(data.protocol);
        const remote = asString(data.remote);
        const bytes = normalizePort(data.bytes) || Math.max(0, Math.floor(asNumber(data.bytes, 0)));
        const text = asString(data.text);
        const base64 = asString(data.base64);
        const content = text ? ` ${text}` : base64 ? ` base64:${base64}` : '';
        appendLog(`${target} ${direction} ${protocol} ${remote} (${bytes}B)${content}`);
        return;
      }

      appendLog(`${target} ${type} ${stringify(ev)}`);
    });
    return () => off();
  }, []);

  useEffect(() => {
    void (async () => {
      const [ss, cs] = await Promise.all([sdk.socket.serverStatus(), sdk.socket.clientStatus()]);
      if (ss.ok) setServerStatus(ss.data);
      if (cs.ok) setClientStatus(cs.data);
    })();
  }, []);

  const persistEndpoints = async (next: EndpointConfig[]) => {
    setEndpoints(next);
    await sdk.storage.set(ENDPOINTS_KEY, next);
  };

  const openCreateEndpoint = () => {
    setModalOpen(true);
    setEditing(null);
    setDraftName('');
    setDraftProtocol('tcp');
    setDraftHost('');
    setDraftPort(0);
  };

  const openEditEndpoint = (ep: EndpointConfig) => {
    setModalOpen(true);
    setEditing(ep);
    setDraftName(ep.name);
    setDraftProtocol(ep.protocol);
    setDraftHost(ep.host);
    setDraftPort(ep.port);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setDraftName('');
    setDraftHost('');
    setDraftPort(0);
  };

  const saveEndpoint = async () => {
    const name = draftName.trim();
    const host = normalizeHost(draftHost);
    const port = normalizePort(draftPort);
    if (!name || !host || !port) {
      appendLog('endpoints ERROR invalid endpoint');
      return;
    }
    const ep: EndpointConfig = {
      id: editing?.id ?? newId(),
      name,
      protocol: draftProtocol,
      host,
      port,
    };
    const next = editing
      ? endpoints.map((x) => (x.id === editing.id ? ep : x))
      : [...endpoints, ep].sort((a, b) => a.name.localeCompare(b.name));
    await persistEndpoints(next);
    closeModal();
  };

  const deleteEndpoint = async (id: string) => {
    const next = endpoints.filter((x) => x.id !== id);
    await persistEndpoints(next);
    if (serverEndpointId === id) setServerEndpointId('');
    if (clientEndpointId === id) setClientEndpointId('');
  };

  const applyEndpointToServer = () => {
    const ep = endpoints.find((x) => x.id === serverEndpointId);
    if (!ep) return;
    setServerProtocol(ep.protocol);
    setServerHost(ep.host);
    setServerPort(ep.port);
  };

  const applyEndpointToClient = () => {
    const ep = endpoints.find((x) => x.id === clientEndpointId);
    if (!ep) return;
    setClientProtocol(ep.protocol);
    setClientHost(ep.host);
    setClientPort(ep.port);
  };

  const serverRunning = useMemo(() => {
    if (!isRecord(serverStatus)) return false;
    return Boolean(serverStatus.running);
  }, [serverStatus]);

  const clientConnected = useMemo(() => {
    if (!isRecord(clientStatus)) return false;
    return Boolean(clientStatus.connected);
  }, [clientStatus]);

  const startServer = async () => {
    const host = normalizeHost(serverHost) || '0.0.0.0';
    const port = normalizePort(serverPort);
    if (!port) {
      appendLog('server ERROR invalid port');
      return;
    }
    const res = await sdk.socket.serverStart({ protocol: serverProtocol, host, port });
    if (!res.ok) {
      appendLog(`server ERROR ${res.error.message}`);
      return;
    }
    setServerStatus(res.data);
  };

  const stopServer = async () => {
    const res = await sdk.socket.serverStop();
    if (!res.ok) {
      appendLog(`server ERROR ${res.error.message}`);
      return;
    }
    setServerStatus(res.data);
  };

  const serverSend = async () => {
    const payload = serverSendPayload;
    if (!payload) return;
    const remote = serverSendRemote.trim() || serverLastRemote;
    const params: Record<string, unknown> = {
      protocol: serverProtocol,
      encoding: serverSendEncoding,
      payload,
    };
    if (serverProtocol === 'tcp' && serverSendConnId.trim()) params.connId = serverSendConnId.trim();
    if (serverProtocol === 'udp' && remote) params.remote = remote;
    const res = await sdk.socket.serverSend(params);
    if (!res.ok) appendLog(`server ERROR ${res.error.message}`);
  };

  const serverKick = async () => {
    if (!serverSendConnId.trim()) return;
    const res = await sdk.socket.serverKick({ connId: serverSendConnId.trim() });
    if (!res.ok) {
      appendLog(`server ERROR ${res.error.message}`);
      return;
    }
    setServerStatus(res.data);
  };

  const connectClient = async () => {
    const host = normalizeHost(clientHost);
    const port = normalizePort(clientPort);
    if (!host || !port) {
      appendLog('client ERROR invalid remote');
      return;
    }
    const res = await sdk.socket.clientConnect({ protocol: clientProtocol, host, port });
    if (!res.ok) {
      appendLog(`client ERROR ${res.error.message}`);
      return;
    }
    setClientStatus(res.data);
  };

  const disconnectClient = async () => {
    const res = await sdk.socket.clientDisconnect();
    if (!res.ok) {
      appendLog(`client ERROR ${res.error.message}`);
      return;
    }
    setClientStatus(res.data);
  };

  const clientSend = async () => {
    const payload = clientSendPayload;
    if (!payload) return;
    const res = await sdk.socket.clientSend({
      protocol: clientProtocol,
      encoding: clientSendEncoding,
      payload,
    });
    if (!res.ok) appendLog(`client ERROR ${res.error.message}`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.tabs}>
        <button
          className={`dtb-button ${styles.tab} ${tab === 'server' ? styles.tabActive : ''}`}
          onClick={() => setTab('server')}
        >
          Server
        </button>
        <button
          className={`dtb-button ${styles.tab} ${tab === 'client' ? styles.tabActive : ''}`}
          onClick={() => setTab('client')}
        >
          Client
        </button>
        <button
          className={`dtb-button ${styles.tab} ${tab === 'endpoints' ? styles.tabActive : ''}`}
          onClick={() => setTab('endpoints')}
        >
          Endpoints
        </button>
      </div>

      {tab === 'server' && (
        <div className={`dtb-card ${styles.card}`}>
          <div className={styles.row}>
            <label>Saved</label>
            <select
              className={`dtb-input ${styles.grow}`}
              value={serverEndpointId}
              onChange={(e) => setServerEndpointId(e.target.value)}
            >
              <option value="">Select…</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name} ({ep.protocol.toUpperCase()} {ep.host}:{ep.port})
                </option>
              ))}
            </select>
            <button className="dtb-button" onClick={applyEndpointToServer} disabled={!serverEndpointId}>
              Use
            </button>
            <button className="dtb-button" onClick={() => setTab('endpoints')}>
              Manage
            </button>
          </div>

          <div className={styles.grid2}>
            <div className={styles.row}>
              <label>Protocol</label>
              <select
                className={`dtb-input ${styles.grow}`}
                value={serverProtocol}
                onChange={(e) => setServerProtocol(e.target.value === 'udp' ? 'udp' : 'tcp')}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
            <div className={styles.row}>
              <label>Port</label>
              <input
                className={`dtb-input ${styles.grow}`}
                value={String(serverPort)}
                onChange={(e) => setServerPort(normalizePort(e.target.value) || 0)}
              />
            </div>
            <div className={styles.row}>
              <label>Host</label>
              <input
                className={`dtb-input ${styles.grow}`}
                value={serverHost}
                onChange={(e) => setServerHost(e.target.value)}
              />
            </div>
            <div className={styles.row}>
              <label>Status</label>
              <div className={styles.grow}>{serverRunning ? 'Running' : 'Stopped'}</div>
            </div>
          </div>

          <div className={styles.actions}>
            <button className="dtb-button" onClick={startServer} disabled={serverRunning}>
              Start
            </button>
            <button className="dtb-button" onClick={stopServer} disabled={!serverRunning}>
              Stop
            </button>
            <button
              className="dtb-button"
              onClick={() => void sdk.socket.serverStatus().then((r) => r.ok && setServerStatus(r.data))}
            >
              Refresh Status
            </button>
          </div>

          <div className={styles.grid2} style={{ marginTop: 10 }}>
            <div className={styles.row}>
              <label>Encoding</label>
              <select
                className={`dtb-input ${styles.grow}`}
                value={serverSendEncoding}
                onChange={(e) => setServerSendEncoding(e.target.value as Encoding)}
              >
                <option value="utf8">UTF-8</option>
                <option value="hex">HEX</option>
                <option value="base64">Base64</option>
              </select>
            </div>
            {serverProtocol === 'tcp' ? (
              <div className={styles.row}>
                <label>Conn</label>
                <select
                  className={`dtb-input ${styles.grow}`}
                  value={serverSendConnId}
                  onChange={(e) => setServerSendConnId(e.target.value)}
                >
                  <option value="">Broadcast</option>
                  {serverConnections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.remote} ({c.id})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className={styles.row}>
                <label>Remote</label>
                <input
                  className={`dtb-input ${styles.grow}`}
                  value={serverSendRemote}
                  onChange={(e) => setServerSendRemote(e.target.value)}
                  placeholder={serverLastRemote || 'host:port'}
                />
              </div>
            )}
          </div>

          <div className={styles.row} style={{ marginTop: 10, alignItems: 'stretch' }}>
            <label>Payload</label>
            <textarea
              className={`dtb-input ${styles.grow} ${styles.textarea}`}
              value={serverSendPayload}
              onChange={(e) => setServerSendPayload(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button
              className="dtb-button"
              onClick={serverSend}
              disabled={!serverRunning || !serverSendPayload}
            >
              Send
            </button>
            <button
              className="dtb-button"
              onClick={serverKick}
              disabled={serverProtocol !== 'tcp' || !serverSendConnId}
            >
              Kick
            </button>
          </div>

          <div className={styles.row} style={{ marginTop: 10, alignItems: 'stretch' }}>
            <label>Raw</label>
            <pre
              className={`dtb-card ${styles.grow}`}
              style={{ padding: 10, margin: 0, whiteSpace: 'pre-wrap' }}
            >
              {stringify(serverStatus)}
            </pre>
          </div>
        </div>
      )}

      {tab === 'client' && (
        <div className={`dtb-card ${styles.card}`}>
          <div className={styles.row}>
            <label>Saved</label>
            <select
              className={`dtb-input ${styles.grow}`}
              value={clientEndpointId}
              onChange={(e) => setClientEndpointId(e.target.value)}
            >
              <option value="">Select…</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name} ({ep.protocol.toUpperCase()} {ep.host}:{ep.port})
                </option>
              ))}
            </select>
            <button className="dtb-button" onClick={applyEndpointToClient} disabled={!clientEndpointId}>
              Use
            </button>
            <button className="dtb-button" onClick={() => setTab('endpoints')}>
              Manage
            </button>
          </div>

          <div className={styles.grid2}>
            <div className={styles.row}>
              <label>Protocol</label>
              <select
                className={`dtb-input ${styles.grow}`}
                value={clientProtocol}
                onChange={(e) => setClientProtocol(e.target.value === 'udp' ? 'udp' : 'tcp')}
              >
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
              </select>
            </div>
            <div className={styles.row}>
              <label>Port</label>
              <input
                className={`dtb-input ${styles.grow}`}
                value={String(clientPort)}
                onChange={(e) => setClientPort(normalizePort(e.target.value) || 0)}
              />
            </div>
            <div className={styles.row}>
              <label>Host</label>
              <input
                className={`dtb-input ${styles.grow}`}
                value={clientHost}
                onChange={(e) => setClientHost(e.target.value)}
              />
            </div>
            <div className={styles.row}>
              <label>Status</label>
              <div className={styles.grow}>{clientConnected ? 'Connected' : 'Disconnected'}</div>
            </div>
          </div>

          <div className={styles.actions}>
            <button className="dtb-button" onClick={connectClient} disabled={clientConnected}>
              Connect
            </button>
            <button className="dtb-button" onClick={disconnectClient} disabled={!clientConnected}>
              Disconnect
            </button>
            <button
              className="dtb-button"
              onClick={() => void sdk.socket.clientStatus().then((r) => r.ok && setClientStatus(r.data))}
            >
              Refresh Status
            </button>
          </div>

          <div className={styles.row} style={{ marginTop: 10 }}>
            <label>Encoding</label>
            <select
              className={`dtb-input ${styles.grow}`}
              value={clientSendEncoding}
              onChange={(e) => setClientSendEncoding(e.target.value as Encoding)}
            >
              <option value="utf8">UTF-8</option>
              <option value="hex">HEX</option>
              <option value="base64">Base64</option>
            </select>
          </div>

          <div className={styles.row} style={{ marginTop: 10, alignItems: 'stretch' }}>
            <label>Payload</label>
            <textarea
              className={`dtb-input ${styles.grow} ${styles.textarea}`}
              value={clientSendPayload}
              onChange={(e) => setClientSendPayload(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button
              className="dtb-button"
              onClick={clientSend}
              disabled={!clientConnected || !clientSendPayload}
            >
              Send
            </button>
          </div>

          <div className={styles.row} style={{ marginTop: 10, alignItems: 'stretch' }}>
            <label>Raw</label>
            <pre
              className={`dtb-card ${styles.grow}`}
              style={{ padding: 10, margin: 0, whiteSpace: 'pre-wrap' }}
            >
              {stringify(clientStatus)}
            </pre>
          </div>
        </div>
      )}

      {tab === 'endpoints' && (
        <div className={`dtb-card ${styles.card}`}>
          <div className={styles.actions}>
            <button className="dtb-button" onClick={openCreateEndpoint}>
              Add Endpoint
            </button>
            <button
              className="dtb-button"
              onClick={() =>
                void sdk.storage.get(ENDPOINTS_KEY).then((r) => r.ok && setEndpoints(parseEndpoints(r.data)))
              }
            >
              Reload
            </button>
          </div>

          <div className={styles.list} style={{ marginTop: 10 }}>
            {endpoints.map((ep) => (
              <div key={ep.id} className={`dtb-card ${styles.endpointItem}`}>
                <div className={styles.endpointMeta}>
                  <div className={styles.endpointTitle}>{ep.name}</div>
                  <div className={styles.endpointSub}>
                    {ep.protocol.toUpperCase()} {ep.host}:{ep.port}
                  </div>
                </div>
                <div className={styles.actions}>
                  <button className="dtb-button" onClick={() => openEditEndpoint(ep)}>
                    Edit
                  </button>
                  <button className="dtb-button" onClick={() => void deleteEndpoint(ep.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {!endpoints.length && <div className="dtb-muted">No endpoints saved.</div>}
          </div>
        </div>
      )}

      <div className={`dtb-card ${styles.card} ${styles.logWrap}`}>
        <div className={styles.logHead}>
          <div>Logs</div>
          <div className={styles.actions}>
            <button className="dtb-button" onClick={() => setLogs([])} disabled={!logs.length}>
              Clear
            </button>
          </div>
        </div>
        <div ref={logBoxRef} className={`dtb-card ${styles.logBox}`}>
          {logs.join('\n')}
        </div>
      </div>

      {modalOpen && (
        <div className={styles.modalMask} onMouseDown={closeModal}>
          <div
            className={`dtb-card ${styles.modal}`}
            role="dialog"
            aria-modal="true"
            aria-label={editing ? 'Edit Endpoint' : 'Add Endpoint'}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <div className={styles.modalTitle}>{editing ? 'Edit Endpoint' : 'Add Endpoint'}</div>
              <button className="dtb-button" onClick={closeModal}>
                Close
              </button>
            </div>

            <div className={styles.grid2}>
              <div className={styles.row}>
                <label>Name</label>
                <input
                  className={`dtb-input ${styles.grow}`}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </div>
              <div className={styles.row}>
                <label>Protocol</label>
                <select
                  className={`dtb-input ${styles.grow}`}
                  value={draftProtocol}
                  onChange={(e) => setDraftProtocol(e.target.value === 'udp' ? 'udp' : 'tcp')}
                >
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>
              <div className={styles.row}>
                <label>Host</label>
                <input
                  className={`dtb-input ${styles.grow}`}
                  value={draftHost}
                  onChange={(e) => setDraftHost(e.target.value)}
                />
              </div>
              <div className={styles.row}>
                <label>Port</label>
                <input
                  className={`dtb-input ${styles.grow}`}
                  value={draftPort ? String(draftPort) : ''}
                  onChange={(e) => setDraftPort(normalizePort(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className={styles.actions} style={{ marginTop: 10 }}>
              <button className="dtb-button primary" onClick={() => void saveEndpoint()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
