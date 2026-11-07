import { useMemo, useState } from 'react';
import { useI18n, type MessageKey } from '../../../i18n';
import { CopyButton } from '../../components';
import { diffStats, diffText, unifiedPatch, type DiffMode } from './diff.model';

const MODE_KEYS: Record<DiffMode, MessageKey> = {
  lines: 'tool.text-diff.lines',
  words: 'tool.text-diff.words',
  chars: 'tool.text-diff.chars',
};

const MAX_RENDERED_ROWS = 2000;

export default function TextDiffTool() {
  const { t } = useI18n();
  const [before, setBefore] = useState('line one\nline two\nline three\n');
  const [after, setAfter] = useState('line one\nline 2\nline three\nline four\n');
  const [mode, setMode] = useState<DiffMode>('lines');

  const rows = useMemo(() => diffText(before, after, mode), [before, after, mode]);
  const stats = useMemo(() => diffStats(rows), [rows]);
  const patch = useMemo(() => unifiedPatch(before, after), [before, after]);
  const visible = rows.slice(0, MAX_RENDERED_ROWS);

  return (
    <div className="tool-body">
      <div className="field">
        <span className="field-label">{t('tool.text-diff.compareBy')}</span>
        <div className="segmented">
          {(Object.keys(MODE_KEYS) as DiffMode[]).map((value) => (
            <button
              key={value}
              type="button"
              className={mode === value ? 'active' : ''}
              onClick={() => setMode(value)}
            >
              {t(MODE_KEYS[value])}
            </button>
          ))}
        </div>
      </div>

      <div className="split">
        <label className="field">
          <span className="field-label">{t('tool.text-diff.before')}</span>
          <textarea
            className="mono"
            rows={10}
            value={before}
            spellCheck={false}
            onChange={(event) => setBefore(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">{t('tool.text-diff.after')}</span>
          <textarea
            className="mono"
            rows={10}
            value={after}
            spellCheck={false}
            onChange={(event) => setAfter(event.target.value)}
          />
        </label>
      </div>

      <div className="field">
        <div className="field-row">
          <span className="field-label">
            Diff{' '}
            <span className="muted small">
              {t('tool.text-diff.stats', {
                added: stats.added,
                removed: stats.removed,
                unchanged: stats.unchanged,
              })}
            </span>
          </span>
          <CopyButton value={patch} label={t('tool.text-diff.copyPatch')} />
        </div>
        <div className="diff-view">
          {visible.map((row, index) => (
            <div key={`${row.type}-${index}`} className={`diff-row ${row.type}`}>
              <span className="diff-sign">
                {row.type === 'added' ? '+' : row.type === 'removed' ? '−' : ' '}
              </span>
              <span className="diff-text">{row.text}</span>
            </div>
          ))}
        </div>
        {rows.length > MAX_RENDERED_ROWS ? (
          <p className="muted small">
            {t('tool.text-diff.truncated', {
              shown: MAX_RENDERED_ROWS,
              total: rows.length,
            })}
          </p>
        ) : null}
      </div>

      <div className="field">
        <span className="field-label">{t('tool.text-diff.patch')}</span>
        <pre className="result mono">{patch}</pre>
      </div>
    </div>
  );
}
