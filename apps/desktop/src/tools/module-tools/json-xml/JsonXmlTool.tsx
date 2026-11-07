import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { jsonToXml, xmlToJson } from './json-xml.model';

type Mode = 'json-to-xml' | 'xml-to-json';

const SAMPLE = '{"catalog":{"@_version":"1","book":{"@_id":"b1","title":"DevToolBox"}}}';

export default function JsonXmlTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('json-to-xml');
  const [input, setInput] = useState(SAMPLE);

  const result = useMemo(() => (mode === 'json-to-xml' ? jsonToXml(input) : xmlToJson(input)), [input, mode]);

  return (
    <div className="tool-body">
      <div className="field">
        <span className="field-label">{t('tool.json-xml.direction')}</span>
        <div className="segmented">
          <button
            type="button"
            className={mode === 'json-to-xml' ? 'active' : ''}
            onClick={() => setMode('json-to-xml')}
          >
            JSON → XML
          </button>
          <button
            type="button"
            className={mode === 'xml-to-json' ? 'active' : ''}
            onClick={() => setMode('xml-to-json')}
          >
            XML → JSON
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">{mode === 'json-to-xml' ? 'JSON' : 'XML'}</span>
        <textarea
          className="mono"
          rows={12}
          value={input}
          spellCheck={false}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>

      <div className="field">
        <div className="field-row">
          <span className="field-label">{mode === 'json-to-xml' ? 'XML' : 'JSON'}</span>
          <CopyButton value={result.ok ? result.value : ''} />
        </div>
        {result.ok ? (
          <textarea className="mono result" rows={12} readOnly value={result.value} />
        ) : (
          <p className="error-text">{result.error}</p>
        )}
      </div>

      <p className="muted small">{t('tool.json-xml.attributes')}</p>
    </div>
  );
}
