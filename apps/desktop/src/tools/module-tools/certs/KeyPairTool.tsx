import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { ALGORITHM_LABELS, generateKeyPair, type KeyAlgorithm, type KeyMaterial } from './certs.api';

export default function KeyPairTool() {
  const { t } = useI18n();
  const [algorithm, setAlgorithm] = useState<KeyAlgorithm>('ecdsa-p256');
  const [material, setMaterial] = useState<KeyMaterial | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onGenerate = async () => {
    setBusy(true);
    setError('');
    try {
      setMaterial(await generateKeyPair(algorithm));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setMaterial(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tool-body">
      <div className="field-row">
        <label className="field compact">
          <span className="field-label">{t('certs.algorithm')}</span>
          <select value={algorithm} onChange={(event) => setAlgorithm(event.target.value as KeyAlgorithm)}>
            {Object.entries(ALGORITHM_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" onClick={() => void onGenerate()} disabled={busy}>
          {busy ? t('certs.generating') : t('certs.generateKeyPair')}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {material ? (
        <>
          <p className="notice-inline">{t('certs.keyPairNotice')}</p>

          <div className="field">
            <div className="field-row">
              <span className="field-label">{t('certs.privateKey')}</span>
              <CopyButton value={material.privateKeyPem} />
            </div>
            <textarea className="mono result" rows={10} readOnly value={material.privateKeyPem} />
          </div>

          <div className="field">
            <div className="field-row">
              <span className="field-label">{t('certs.publicKey')}</span>
              <CopyButton value={material.publicKeyPem} />
            </div>
            <textarea className="mono result" rows={6} readOnly value={material.publicKeyPem} />
          </div>
        </>
      ) : null}
    </div>
  );
}
