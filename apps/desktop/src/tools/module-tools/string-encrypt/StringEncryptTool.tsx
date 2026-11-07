import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { decryptText, encryptText } from './crypto.model';

type Mode = 'encrypt' | 'decrypt';

export default function StringEncryptTool() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>('encrypt');
  const [password, setPassword] = useState('');
  const [input, setInput] = useState('secret message');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError('');
    const result =
      mode === 'encrypt' ? await encryptText(input, password) : await decryptText(input, password);
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
      <div className="field">
        <span className="field-label">{t('common.mode')}</span>
        <div className="segmented">
          <button
            type="button"
            className={mode === 'encrypt' ? 'active' : ''}
            onClick={() => setMode('encrypt')}
          >
            {t('tool.string-encrypt.encrypt')}
          </button>
          <button
            type="button"
            className={mode === 'decrypt' ? 'active' : ''}
            onClick={() => setMode('decrypt')}
          >
            {t('tool.string-encrypt.decrypt')}
          </button>
        </div>
      </div>

      <label className="field compact">
        <span className="field-label">{t('tool.string-encrypt.password')}</span>
        <input
          type="password"
          value={password}
          autoComplete="new-password"
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">
          {mode === 'encrypt' ? t('tool.string-encrypt.plaintext') : t('tool.string-encrypt.payload')}
        </span>
        <textarea
          className="mono"
          rows={7}
          value={input}
          spellCheck={false}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>

      <div className="field-row">
        <button
          type="button"
          className="primary"
          onClick={() => void run()}
          disabled={busy || !password || !input}
        >
          {busy
            ? t('action.working')
            : mode === 'encrypt'
              ? t('tool.string-encrypt.encrypt')
              : t('tool.string-encrypt.decrypt')}
        </button>
        <CopyButton value={output} />
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {output ? (
        <textarea
          className="mono result"
          rows={7}
          readOnly
          value={output}
          aria-label={t('tool.string-encrypt.result')}
        />
      ) : null}

      <p className="muted small">{t('tool.string-encrypt.explanation')}</p>
    </div>
  );
}
