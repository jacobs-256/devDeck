import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import {
  ALGORITHM_LABELS,
  emptySubject,
  generateCa,
  type CertificateMaterial,
  type KeyAlgorithm,
  type SubjectInput,
} from './certs.api';
import { SubjectFields } from './SubjectFields';

export default function CaGeneratorTool() {
  const { t } = useI18n();
  const [subject, setSubject] = useState<SubjectInput>({
    ...emptySubject(),
    commonName: 'DevToolBox Root CA',
    organization: 'DevToolBox',
  });
  const [days, setDays] = useState(3650);
  const [algorithm, setAlgorithm] = useState<KeyAlgorithm>('ecdsa-p256');
  const [material, setMaterial] = useState<CertificateMaterial | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onGenerate = async () => {
    setBusy(true);
    setError('');
    try {
      setMaterial(await generateCa(subject, days, algorithm));
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
          <span className="field-label">{t('certs.validity')}</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={days}
            onChange={(event) => setDays(Number(event.target.value) || 0)}
          />
        </label>
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
          {busy ? t('certs.generating') : t('certs.generateCa')}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {material ? (
        <>
          <p className="notice-inline">{t('certs.caNotice')}</p>

          <div className="field">
            <div className="field-row">
              <span className="field-label">{t('certs.caCertificate')}</span>
              <CopyButton value={material.certificatePem} />
            </div>
            <textarea className="mono result" rows={10} readOnly value={material.certificatePem} />
          </div>

          <div className="field">
            <div className="field-row">
              <span className="field-label">{t('certs.caPrivateKey')}</span>
              <CopyButton value={material.privateKeyPem} />
            </div>
            <textarea className="mono result" rows={8} readOnly value={material.privateKeyPem} />
          </div>
        </>
      ) : null}
    </div>
  );
}
