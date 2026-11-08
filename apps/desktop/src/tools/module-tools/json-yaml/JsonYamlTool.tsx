import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { jsonToYaml, yamlToJson } from './json-yaml.model';

type Mode = 'json-to-yaml' | 'yaml-to-json';

const SAMPLE = '{"name":"DevDeck","version":"2.1.0","plugins":[{"id":"market-demo"}]}';

export default function JsonYamlTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('json-to-yaml');
  const [input, setInput] = useState(SAMPLE);

  const result = useMemo(
    () => (mode === 'json-to-yaml' ? jsonToYaml(input) : yamlToJson(input)),
    [input, mode],
  );

  return (
    <div className="tool-body">
      <div className="field">
        <span className="field-label">{t('tool.json-yaml.direction')}</span>
        <div className="segmented">
          <button
            type="button"
            className={mode === 'json-to-yaml' ? 'active' : ''}
            onClick={() => setMode('json-to-yaml')}
          >
            JSON → YAML
          </button>
          <button
            type="button"
            className={mode === 'yaml-to-json' ? 'active' : ''}
            onClick={() => setMode('yaml-to-json')}
          >
            YAML → JSON
          </button>
        </div>
      </div>

      <label className="field">
        <span className="field-label">{mode === 'json-to-yaml' ? 'JSON' : 'YAML'}</span>
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
          <span className="field-label">{mode === 'json-to-yaml' ? 'YAML' : 'JSON'}</span>
          <CopyButton value={result.ok ? result.value : ''} />
        </div>
        {result.ok ? (
          <textarea className="mono result" rows={12} readOnly value={result.value} />
        ) : (
          <p className="error-text">{result.error}</p>
        )}
      </div>
    </div>
  );
}
