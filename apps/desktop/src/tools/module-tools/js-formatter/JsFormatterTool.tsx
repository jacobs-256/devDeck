import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { formatJs, minifyJs } from './js.model';

const SAMPLE = `function greet(name){const parts=["Hello",name];return parts.join(", ")}

const users=[{id:1,name:"Ada"},{id:2,name:"Grace"}];

users.forEach((user)=>{console.log(greet(user.name))})`;

export default function JsFormatterTool() {
  const { t } = useI18n();
  const [code, setCode] = useState(SAMPLE);
  const [output, setOutput] = useState('');
  const [indent, setIndent] = useState(2);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action: 'format' | 'minify') => {
    setBusy(true);
    setError('');
    const result = action === 'format' ? formatJs(code, indent) : await minifyJs(code);
    if (result.ok) {
      setOutput(result.value);
    } else {
      setOutput('');
      setError(result.error);
    }
    setBusy(false);
  };

  return (
    <div className="tool-body">
      <div className="field-row">
        <button type="button" className="primary" onClick={() => void run('format')} disabled={busy}>
          {t('tool.js-formatter.format')}
        </button>
        <button type="button" className="ghost" onClick={() => void run('minify')} disabled={busy}>
          {t('tool.js-formatter.minify')}
        </button>
        <label className="field compact">
          <span className="field-label">{t('tool.js-formatter.indent')}</span>
          <select value={indent} onChange={(event) => setIndent(Number(event.target.value))}>
            <option value={2}>{t('tool.js-formatter.indent2')}</option>
            <option value={4}>{t('tool.js-formatter.indent4')}</option>
          </select>
        </label>
      </div>

      <label className="field">
        <span className="field-label">{t('tool.js-formatter.javascript')}</span>
        <textarea
          className="mono"
          rows={12}
          value={code}
          spellCheck={false}
          onChange={(event) => setCode(event.target.value)}
        />
      </label>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="field">
        <div className="field-row">
          <span className="field-label">{t('common.output')}</span>
          <CopyButton value={output} />
        </div>
        <textarea className="mono result" rows={12} readOnly value={output} />
      </div>

      <p className="muted small">{t('tool.js-formatter.note')}</p>
    </div>
  );
}
