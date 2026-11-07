import { useMemo, useState } from 'react';
import { useI18n, type MessageKey } from '../../../i18n';
import { CopyButton } from '../../components';
import { formatJson, minifyJson, sortKeysJson, summarizeJson } from './json.model';

type Mode = 'format' | 'minify' | 'sort' | 'summary';

const MODE_KEYS: Record<Mode, MessageKey> = {
  format: 'tool.json-formatter.format',
  minify: 'tool.json-formatter.minify',
  sort: 'tool.json-formatter.sort',
  summary: 'tool.json-formatter.summary',
};

const SAMPLE = '{"name":"DevToolBox","version":"2.1.0","plugins":[{"id":"market-demo"}]}';

export default function JsonFormatterTool() {
  const { t } = useI18n();
  const [input, setInput] = useState(SAMPLE);
  const [mode, setMode] = useState<Mode>('format');

  const result = useMemo(() => {
    switch (mode) {
      case 'minify':
        return minifyJson(input);
      case 'sort':
        return sortKeysJson(input);
      case 'summary':
        return summarizeJson(input);
      default:
        return formatJson(input);
    }
  }, [input, mode]);

  return (
    <div className="tool-body">
      <div className="field">
        <span className="field-label">{t('tool.json-formatter.action')}</span>
        <div className="segmented">
          {(Object.keys(MODE_KEYS) as Mode[]).map((value) => (
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

      <label className="field">
        <span className="field-label">{t('common.input')}</span>
        <textarea
          className="mono"
          rows={10}
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
          <textarea className="mono result" rows={10} readOnly value={result.value} />
        ) : (
          <p className="error-text">{result.error}</p>
        )}
      </div>
    </div>
  );
}
