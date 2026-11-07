import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../../i18n';
import { describeData, validateWsUrl } from './ws.model';

type Status = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface LogEntry {
  id: number;
  direction: 'in' | 'out' | 'system';
  text: string;
  at: string;
}

export default function WebSocketTesterTool() {
  const { t } = useI18n();
  const [url, setUrl] = useState('wss://echo.websocket.org');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('{"hello":"world"}');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [error, setError] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const nextId = useRef(1);

  const append = (direction: LogEntry['direction'], text: string) => {
    setLog((entries) => [
      ...entries.slice(-199),
      {
        id: nextId.current++,
        direction,
        text,
        at: new Date().toLocaleTimeString(),
      },
    ]);
  };

  const closeSocket = () => {
    socketRef.current?.close();
    socketRef.current = null;
  };

  useEffect(() => () => closeSocket(), []);

  const connect = () => {
    const check = validateWsUrl(url);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError('');
    closeSocket();
    setStatus('connecting');
    append('system', `Connecting to ${check.url}`);

    const socket = new WebSocket(check.url);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('open');
      append('system', 'Connected');
    };
    socket.onmessage = (event: MessageEvent) => {
      if (typeof event.data === 'string') {
        append('in', event.data);
      } else if (event.data instanceof Blob) {
        void event.data.text().then((text) => append('in', text));
      } else if (event.data instanceof ArrayBuffer || ArrayBuffer.isView(event.data)) {
        append('in', describeData(event.data));
      } else {
        append('in', String(event.data));
      }
    };
    socket.onerror = () => {
      setStatus('error');
      append('system', 'Connection error (the URL may be unreachable)');
    };
    socket.onclose = (event: CloseEvent) => {
      setStatus('closed');
      append('system', `Closed (code ${event.code})`);
    };
  };

  const send = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError(t('tool.websocket.notConnected'));
      return;
    }
    socket.send(message);
    append('out', message);
  };

  return (
    <div className="tool-body">
      <label className="field">
        <span className="field-label">{t('tool.websocket.url')}</span>
        <input
          className="mono"
          value={url}
          spellCheck={false}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>

      <div className="field-row">
        <button
          type="button"
          className="primary"
          onClick={connect}
          disabled={status === 'connecting' || status === 'open'}
        >
          {t('common.connect')}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            closeSocket();
            setStatus('closed');
          }}
          disabled={status !== 'open' && status !== 'connecting'}
        >
          {t('common.disconnect')}
        </button>
        <span className={status === 'open' ? 'badge ok' : status === 'error' ? 'badge bad' : 'badge'}>
          {status}
        </span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="field-row">
        <label className="field grow">
          <span className="field-label">{t('tool.websocket.message')}</span>
          <input
            className="mono"
            value={message}
            spellCheck={false}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>
        <button type="button" className="primary" onClick={send} disabled={status !== 'open' || !message}>
          {t('common.send')}
        </button>
      </div>

      <div className="field">
        <div className="field-row">
          <span className="field-label">{t('tool.websocket.log', { count: log.length })}</span>
          <button type="button" className="ghost" onClick={() => setLog([])} disabled={!log.length}>
            {t('common.clear')}
          </button>
        </div>
        <div className="diff-view">
          {log.length === 0 ? (
            <p className="muted small" style={{ padding: 8 }}>
              {t('tool.websocket.noMessages')}
            </p>
          ) : (
            log.map((entry) => (
              <div key={entry.id} className="ws-log-row">
                <span className="muted small">{entry.at}</span>
                <span className={`badge ${entry.direction === 'in' ? 'ok' : ''}`}>{entry.direction}</span>
                <span className="mono break">{entry.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <p className="muted small">{t('tool.websocket.note')}</p>
    </div>
  );
}
