import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface MqttEvent {
  sessionId: string;
  event: string;
  topic?: string;
  payload?: string;
  qos?: number;
  retain?: boolean;
  message?: string;
}

interface LogEntry {
  id: number;
  at: string;
  kind: string;
  text: string;
}

export default function MqttTool() {
  const { t } = useI18n();
  const [broker, setBroker] = useState('mqtt://test.mosquitto.org');
  const [clientId, setClientId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [status, setStatus] = useState('idle');
  const [topic, setTopic] = useState('devtoolbox/test');
  const [qos, setQos] = useState(0);
  const [retain, setRetain] = useState(false);
  const [payload, setPayload] = useState('{"hello":"mqtt"}');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const sessionRef = useRef('');
  const nextId = useRef(1);

  const append = (kind: string, text: string) => {
    setLog((entries) => [
      ...entries.slice(-199),
      { id: nextId.current++, kind, text, at: new Date().toLocaleTimeString() },
    ]);
  };

  // Legacy shortcut: Cmd/Ctrl+F filters the message log.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFilterOpen(true);
        return;
      }
      if (event.key === 'Escape' && filterOpen) {
        setFilterOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filterOpen]);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;

    void listen<MqttEvent>('tool-mqtt', (event) => {
      const payload = event.payload;
      if (!payload || payload.sessionId !== sessionRef.current) return;

      setStatus(payload.event);
      if (payload.event === 'message') {
        append(
          'message',
          `${payload.topic ?? '?'}${payload.retain ? ` ${t('tool.mqtt.retained')}` : ''}: ${payload.payload ?? ''}`,
        );
      } else if (payload.event === 'error') {
        append('error', payload.message ?? t('tool.mqtt.error'));
      } else if (payload.message) {
        append(payload.event, payload.message);
      } else {
        append(payload.event, payload.topic ?? '');
      }
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else dispose = unlisten;
    });

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [t]);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const id = await invoke<string>('mqtt_connect', {
        broker,
        clientId: clientId || null,
        username: username || null,
        password: password || null,
        keepAlive: 60,
      });
      sessionRef.current = id;
      setSessionId(id);
      setStatus('connecting');
      append('system', t('tool.mqtt.connecting', { broker }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setStatus('error');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!sessionId) return;
    try {
      await invoke('mqtt_disconnect', { sessionId });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      sessionRef.current = '';
      setSessionId('');
      setStatus('disconnected');
    }
  };

  const subscribe = async () => {
    if (!sessionId) return;
    setError('');
    try {
      await invoke('mqtt_subscribe', { sessionId, topic, qos });
      append('subscribe', topic);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const publish = async () => {
    if (!sessionId) return;
    setError('');
    try {
      await invoke('mqtt_publish', { sessionId, topic, payload, qos, retain });
      append('publish', `${topic}: ${payload}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const connected = Boolean(sessionId) && status !== 'disconnected' && status !== 'error';
  const visibleLog = log.filter((entry) => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return true;
    return entry.text.toLowerCase().includes(needle) || entry.kind.toLowerCase().includes(needle);
  });

  return (
    <div className="tool-body">
      <div className="field-row">
        <label className="field grow">
          <span className="field-label">{t('tool.mqtt.broker')}</span>
          <input
            className="mono"
            value={broker}
            spellCheck={false}
            onChange={(event) => setBroker(event.target.value)}
          />
        </label>
        <label className="field compact">
          <span className="field-label">{t('tool.mqtt.clientId')}</span>
          <input value={clientId} onChange={(event) => setClientId(event.target.value)} />
        </label>
        <label className="field compact">
          <span className="field-label">{t('tool.mqtt.username')}</span>
          <input value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label className="field compact">
          <span className="field-label">{t('tool.mqtt.password')}</span>
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="button" className="primary" onClick={() => void connect()} disabled={busy || connected}>
          {t('common.connect')}
        </button>
        <button type="button" className="ghost" onClick={() => void disconnect()} disabled={!sessionId}>
          {t('common.disconnect')}
        </button>
        <span className={status === 'error' ? 'badge bad' : connected ? 'badge ok' : 'badge'}>{status}</span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="field-row">
        <label className="field grow">
          <span className="field-label">{t('tool.mqtt.topic')}</span>
          <input
            className="mono"
            value={topic}
            spellCheck={false}
            onChange={(event) => setTopic(event.target.value)}
          />
        </label>
        <label className="field compact">
          <span className="field-label">QoS</span>
          <select value={qos} onChange={(event) => setQos(Number(event.target.value))}>
            <option value={0}>0</option>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <button type="button" className="ghost" onClick={() => void subscribe()} disabled={!sessionId}>
          {t('tool.mqtt.subscribe')}
        </button>
      </div>

      <label className="field">
        <span className="field-label">{t('tool.mqtt.payload')}</span>
        <textarea
          className="mono"
          rows={4}
          value={payload}
          spellCheck={false}
          onChange={(event) => setPayload(event.target.value)}
        />
      </label>

      <div className="field-row">
        <label className="checkbox">
          <input type="checkbox" checked={retain} onChange={(event) => setRetain(event.target.checked)} />
          {t('tool.mqtt.retain')}
        </label>
        <button type="button" className="primary" onClick={() => void publish()} disabled={!sessionId}>
          {t('tool.mqtt.publish')}
        </button>
      </div>

      <div className="field">
        <div className="field-row">
          <span className="field-label">{t('tool.mqtt.messages', { count: log.length })}</span>
          {filterOpen ? (
            <input
              autoFocus
              value={filter}
              placeholder="Filter messages…"
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setFilterOpen(false);
              }}
            />
          ) : null}
          <button type="button" className="ghost" onClick={() => setLog([])} disabled={!log.length}>
            {t('common.clear')}
          </button>
        </div>
        <div className="diff-view">
          {log.length === 0 ? (
            <p className="muted small" style={{ padding: 8 }}>
              {t('tool.mqtt.noActivity')}
            </p>
          ) : (
            visibleLog.map((entry) => (
              <div key={entry.id} className="ws-log-row">
                <span className="muted small">{entry.at}</span>
                <span className={`badge ${entry.kind === 'error' ? 'bad' : ''}`}>{entry.kind}</span>
                <span className="mono break">{entry.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="muted small">{t('tool.mqtt.note')}</p>
    </div>
  );
}
