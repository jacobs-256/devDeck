import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { invoke } from '@tauri-apps/api/core';

interface TraceReport {
  host: string;
  command: string;
  output: string;
  exitCode?: number;
  truncated: boolean;
}

export default function TracertTool() {
  const { t } = useI18n();
  const [host, setHost] = useState('example.com');
  const [maxHops, setMaxHops] = useState(30);
  const [report, setReport] = useState<TraceReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setReport(await invoke<TraceReport>('traceroute', { host, maxHops }));
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
          <span className="field-label">{t('tool.tracert.host')}</span>
          <input
            className="mono"
            value={host}
            spellCheck={false}
            onChange={(event) => setHost(event.target.value)}
          />
        </label>
        <label className="field compact">
          <span className="field-label">{t('tool.tracert.maxHops')}</span>
          <input
            type="number"
            min={1}
            max={30}
            value={maxHops}
            onChange={(event) => setMaxHops(Number(event.target.value) || 1)}
          />
        </label>
        <button type="button" className="primary" onClick={() => void run()} disabled={busy}>
          {busy ? t('tool.tracert.tracing') : t('tool.tracert.trace')}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {report ? (
        <>
          <p className="muted small">
            <code>{report.command}</code>
            {report.exitCode !== undefined ? ` · ${t('tool.tracert.exit', { code: report.exitCode })}` : ''}
            {report.truncated ? ` · ${t('tool.tracert.truncated')}` : ''}
          </p>
          <pre className="result mono">{report.output || t('tool.tracert.noOutput')}</pre>
        </>
      ) : null}

      <p className="muted small">{t('tool.tracert.note')}</p>
    </div>
  );
}
