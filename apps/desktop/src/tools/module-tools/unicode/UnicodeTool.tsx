import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { escapeUnicode, inspectText, unescapeUnicode, type EscapeStyle } from './unicode.model';

type Mode = 'escape' | 'unescape';

export default function UnicodeTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('escape');
  const [style, setStyle] = useState<EscapeStyle>('u');
  const [input, setInput] = useState('Hello 世界 😀');

  const result = useMemo(
    () =>
      mode === 'escape' ? { ok: true as const, value: escapeUnicode(input, style) } : unescapeUnicode(input),
    [input, mode, style],
  );

  const chars = useMemo(() => inspectText(input, 60), [input]);

  return (
    <div className="tool-body">
      <div className="field-row">
        <div className="field">
          <span className="field-label">{t('common.mode')}</span>
          <div className="segmented">
            <button
              type="button"
              className={mode === 'escape' ? 'active' : ''}
              onClick={() => setMode('escape')}
            >
              {t('tool.unicode.escape')}
            </button>
            <button
              type="button"
              className={mode === 'unescape' ? 'active' : ''}
              onClick={() => setMode('unescape')}
            >
              {t('tool.unicode.unescape')}
            </button>
          </div>
        </div>

        {mode === 'escape' ? (
          <label className="field compact">
            <span className="field-label">{t('tool.unicode.style')}</span>
            <select value={style} onChange={(event) => setStyle(event.target.value as EscapeStyle)}>
              <option value="u">\uXXXX</option>
              <option value="brace">\u{'{…}'}</option>
            </select>
          </label>
        ) : null}
      </div>

      <label className="field">
        <span className="field-label">{t('common.input')}</span>
        <textarea
          className="mono"
          rows={6}
          value={input}
          spellCheck={false}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>

      <div className="field">
        <div className="field-row">
          <span className="field-label">{t('common.output')}</span>
          <CopyButton value={result.ok ? result.value : ''} />
        </div>
        {result.ok ? (
          <textarea className="mono result" rows={6} readOnly value={result.value} />
        ) : (
          <p className="error-text">{result.error}</p>
        )}
      </div>

      <div className="field">
        <span className="field-label">{t('tool.unicode.characters', { count: chars.length })}</span>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('tool.unicode.char')}</th>
              <th>{t('tool.unicode.codePoint')}</th>
              <th>{t('tool.unicode.decimal')}</th>
              <th>{t('tool.unicode.utf8')}</th>
              <th>{t('tool.unicode.utf16')}</th>
            </tr>
          </thead>
          <tbody>
            {chars.map((info, index) => (
              <tr key={`${info.codePoint}-${index}`}>
                <td className="mono">{info.char === '\n' ? '\\n' : info.char}</td>
                <td className="mono">{info.codePoint}</td>
                <td>{info.decimal}</td>
                <td>{info.utf8Bytes} B</td>
                <td>{info.utf16Units}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
