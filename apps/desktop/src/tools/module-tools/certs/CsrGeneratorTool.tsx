import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import {
  ALGORITHM_LABELS,
  emptySubject,
  generateCsr,
  type CsrMaterial,
  type KeyAlgorithm,
  type SubjectInput,
} from './certs.api';
import { SubjectFields } from './SubjectFields';

export default function CsrGeneratorTool() {
  const { t } = useI18n();
  const [subject, setSubject] = useState<SubjectInput>({
    ...emptySubject(),
    commonName: 'server.example.com',
    organization: 'DevDeck',
  });
  const [algorithm, setAlgorithm] = useState<KeyAlgorithm>('ecdsa-p256');
  const [material, setMaterial] = useState<CsrMaterial | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onGenerate = async () => {
    setBusy(true);
    setError('');
    try {
      setMaterial(await generateCsr(subject, algorithm));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setMaterial(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tool-body">
      <SubjectFields value={subject} onChange={setSubject} />

      <div className="field-row">
        <label className="field compact">
          <span className="field-label">{t('certs.keyAlgorithm')}</span>
          <select value={algorithm} onChange={(event) => setAlgorithm(event.target.value as KeyAlgorithm)}>
            {Object.entries(ALGORITHM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" onClick={() => void onGenerate()} disabled={busy}>
          {busy ? t('certs.generating') : t('certs.generateCsr')}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {material ? (
        <>
          <div className="field">
            <div className="field-row">
              <span className="field-label">{t('certs.csrLong')}</span>
              <CopyButton value={material.csrPem} />
            </div>
            <textarea className="mono result" rows={10} readOnly value={material.csrPem} />
          </div>

          <div className="field">
            <div className="field-row">
              <span className="field-label">{t('certs.privateKeyKeep')}</span>
              <CopyButton value={material.privateKeyPem} />
            </div>
            <textarea className="mono result" rows={8} readOnly value={material.privateKeyPem} />
          </div>

          <p className="muted small">{t('certs.csrNotice')}</p>
        </>
      ) : null}
    </div>
  );
}
