import { useMemo, useState } from 'react';
import type { MessageKey } from '../../../i18n';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { buildQuery, decodeComponent, decodeUri, encodeComponent, encodeUri, parseQuery } from './url.model';

type Mode = 'encode' | 'decode' | 'encode-uri' | 'decode-uri' | 'parse-query';

const MODE_KEYS: Record<Mode, MessageKey> = {
  encode: 'tool.url-codec.encode',
  decode: 'tool.url-codec.decode',
  'encode-uri': 'tool.url-codec.encodeUri',
  'decode-uri': 'tool.url-codec.decodeUri',
  'parse-query': 'tool.url-codec.parseQuery',
};

type Result =
  | { kind: 'text'; ok: true; value: string }
  | { kind: 'text'; ok: false; error: string }
  | { kind: 'pairs'; ok: true; value: ReturnType<typeof parseQuery> };

export default function UrlCodecTool() {
  const { t } = useI18n();
  const [input, setInput] = useState('https://example.com/search?q=hello world&lang=中文');
  const [mode, setMode] = useState<Mode>('encode');

  const result = useMemo<Result>(() => {
    if (mode === 'parse-query') {
      return { kind: 'pairs', ok: true, value: parseQuery(input) };
    }
    if (mode === 'encode') return { kind: 'text', ok: true, value: encodeComponent(input) };
    if (mode === 'encode-uri') return { kind: 'text', ok: true, value: encodeUri(input) };
    if (mode === 'decode') return { kind: 'text', ...decodeComponent(input) };
    return { kind: 'text', ...decodeUri(input) };
  }, [input, mode]);

  const rebuilt = result.kind === 'pairs' ? buildQuery(result.value) : '';

  return (
    <div className="tool-body">
      <label className="field">
        <span className="field-label">{t('tool.url-codec.operation')}</span>
        <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
          {(Object.keys(MODE_KEYS) as Mode[]).map((value) => (
            <option key={value} value={value}>
              {t(MODE_KEYS[value])}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">{t('common.input')}</span>
        <textarea
          className="mono"
          rows={7}
          value={input}
          spellCheck={false}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>

      <div className="field">
        <div className="field-row">
          <span className="field-label">{t('common.output')}</span>
          <CopyButton value={result.ok && result.kind === 'text' ? result.value : rebuilt} />
        </div>

        {result.kind === 'text' ? (
          result.ok ? (
            <textarea className="mono result" rows={7} readOnly value={result.value} />
          ) : (
            <p className="error-text">{result.error}</p>
          )
        ) : (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.key')}</th>
                  <th>{t('common.value')}</th>
                </tr>
              </thead>
              <tbody>
                {result.value.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="muted">
                      {t('tool.url-codec.noParams')}
                    </td>
                  </tr>
                ) : (
                  result.value.map((pair, index) => (
                    <tr key={`${pair.key}-${index}`}>
                      <td className="mono">{pair.key}</td>
                      <td className="mono">{pair.value}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {rebuilt ? (
              <p className="muted small">{t('tool.url-codec.rebuilt', { value: rebuilt })}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
