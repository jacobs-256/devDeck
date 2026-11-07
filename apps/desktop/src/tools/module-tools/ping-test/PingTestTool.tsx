import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { invoke } from '@tauri-apps/api/core';

interface PingSample {
  seq: number;
  latencyMs?: number;
  error?: string;
}

interface PingReport {
  host: string;
  port: number;
  resolved: string;
  samples: PingSample[];
  sent: number;
  received: number;
  minMs?: number;
  maxMs?: number;
  avgMs?: number;
}

const formatMs = (value?: number) => (value === undefined ? '—' : `${value.toFixed(2)} ms`);

export default function PingTestTool() {
  const { t } = useI18n();
  const [host, setHost] = useState('example.com');
  const [port, setPort] = useState(443);
  const [count, setCount] = useState(4);
  const [timeoutMs, setTimeoutMs] = useState(2000);
  const [report, setReport] = useState<PingReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setReport(await invoke<PingReport>('tcp_ping', { host, port, count, timeoutMs }));
    } catch (reason) {
      setReport(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tool-body">
      <div className="field-row">
        <label className="field grow">
          <span className="field-label">{t('tool.tcp-ping.host')}</span>
          <input
            className="mono"
            value={host}
            spellCheck={false}
            onChange={(event) => setHost(event.target.value)}
          />
        </label>
        <label className="field compact">
          <span className="field-label">{t('tool.tcp-ping.port')}</span>
          <input
            type="number"
            min={1}
            max={65535}
            value={port}
            onChange={(event) => setPort(Number(event.target.value) || 1)}
          />
        </label>
        <label className="field compact">
          <span className="field-label">{t('tool.tcp-ping.count')}</span>
          <input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(event) => setCount(Number(event.target.value) || 1)}
          />
        </label>
        <label className="field compact">
          <span className="field-label">{t('tool.tcp-ping.timeout')}</span>
          <input
            type="number"
            min={100}
            max={10000}
            value={timeoutMs}
            onChange={(event) => setTimeoutMs(Number(event.target.value) || 1000)}
          />
        </label>
        <button type="button" className="primary" onClick={() => void run()} disabled={busy}>
          {busy ? t('tool.tcp-ping.probing') : t('tool.tcp-ping.ping')}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {report ? (
        <>
          <div className="field-row">
            <span className="badge">{report.resolved}</span>
            <span className={report.received > 0 ? 'badge ok' : 'badge bad'}>
              {t('tool.tcp-ping.succeeded', {
                received: report.received,
                sent: report.sent,
              })}
            </span>
            <span className="muted small">
              {t('tool.tcp-ping.stats', {
                min: formatMs(report.minMs),
                avg: formatMs(report.avgMs),
                max: formatMs(report.maxMs),
              })}
            </span>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('tool.tcp-ping.result')}</th>
              </tr>
            </thead>
            <tbody>
              {report.samples.map((sample) => (
                <tr key={sample.seq}>
                  <td>{sample.seq}</td>
                  <td className={sample.error ? 'error-text' : 'mono'}>
                    {sample.error
                      ? t('tool.tcp-ping.failed', { error: sample.error })
                      : formatMs(sample.latencyMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      <p className="muted small">{t('tool.tcp-ping.note')}</p>
    </div>
  );
}
