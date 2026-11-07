import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { byteLength, decodeBase64, encodeBase64 } from './base64.model';

type Mode = 'encode' | 'decode';

export default function Base64Tool() {
  const { t } = useI18n();
  const [input, setInput] = useState('Hello, DevToolBox!');
  const [mode, setMode] = useState<Mode>('encode');
  const [urlSafe, setUrlSafe] = useState(false);

  const result = useMemo(
    () =>
      mode === 'encode' ? { ok: true as const, value: encodeBase64(input, urlSafe) } : decodeBase64(input),
    [input, mode, urlSafe],
  );

  return (
    <div className="tool-body">
      <div className="field">
        <span className="field-label">{t('common.mode')}</span>
        <div className="segmented">
          <button
            type="button"
            className={mode === 'encode' ? 'active' : ''}
            onClick={() => setMode('encode')}
          >
            {t('tool.base64.encode')}
          </button>
          <button
            type="button"
            className={mode === 'decode' ? 'active' : ''}
            onClick={() => setMode('decode')}
          >
            {t('tool.base64.decode')}
          </button>
        </div>
      </div>

      {mode === 'encode' ? (
        <label className="checkbox">
          <input type="checkbox" checked={urlSafe} onChange={(event) => setUrlSafe(event.target.checked)} />
          {t('tool.base64.urlSafe')}
        </label>
      ) : null}

      <label className="field">
        <span className="field-label">{t('common.input')}</span>
        <textarea
          className="mono"
          rows={8}
          value={input}
          spellCheck={false}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>

      <div className="field">
        <div className="field-row">
          <span className="field-label">
            {mode === 'encode' ? t('tool.base64.outputB64') : t('tool.base64.outputPlain')}
          </span>
          <CopyButton value={result.ok ? result.value : ''} />
        </div>
        {result.ok ? (
          <textarea className="mono result" rows={8} readOnly value={result.value} />
        ) : (
          <p className="error-text">{result.error}</p>
        )}
      </div>

      <p className="muted small">
        {t('tool.base64.stats', {
          input: byteLength(input),
          output: result.ok ? result.value.length : 0,
        })}
      </p>
    </div>
  );
}
