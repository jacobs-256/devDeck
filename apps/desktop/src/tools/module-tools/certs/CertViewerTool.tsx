import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { parseCertificate, formatTimestamp, type CertificateInfo } from './certs.api';

export default function CertViewerTool() {
  const { t } = useI18n();
  const [pem, setPem] = useState('');
  const [info, setInfo] = useState<CertificateInfo | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onParse = async () => {
    setBusy(true);
    setError('');
    try {
      setInfo(await parseCertificate(pem));
    } catch (reason) {
      setInfo(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const expired = info ? info.notAfter * 1000 < Date.now() : false;

  return (
    <div className="tool-body">
      <label className="field">
        <span className="field-label">{t('certs.certificate')}</span>
        <textarea
          className="mono"
          rows={10}
          placeholder="-----BEGIN CERTIFICATE-----"
          value={pem}
          spellCheck={false}
          onChange={(event) => setPem(event.target.value)}
        />
      </label>

      <div className="field-row">
        <button
          type="button"
          className="primary"
          onClick={() => void onParse()}
          disabled={busy || !pem.trim()}
        >
          {busy ? t('certs.parsing') : t('certs.parse')}
        </button>
        {info ? (
          <span className={expired ? 'badge bad' : 'badge ok'}>
            {expired ? t('certs.expired') : t('certs.valid')} · {info.keyAlgorithm}
          </span>
        ) : null}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {info ? (
        <dl className="kv">
          <dt>{t('certs.subject')}</dt>
          <dd className="mono">{info.subject}</dd>
          <dt>{t('certs.issuer')}</dt>
          <dd className="mono">{info.issuer}</dd>
          <dt>{t('certs.serial')}</dt>
          <dd className="mono break">{info.serial}</dd>
          <dt>{t('certs.notBefore')}</dt>
          <dd className="mono">{formatTimestamp(info.notBefore)}</dd>
          <dt>{t('certs.notAfter')}</dt>
          <dd className="mono">{formatTimestamp(info.notAfter)}</dd>
          <dt>{t('certs.isCa')}</dt>
          <dd>{info.isCa ? t('certs.yes') : t('certs.no')}</dd>
          <dt>{t('certs.publicKeyInfo')}</dt>
          <dd className="mono">{info.keyAlgorithm}</dd>
          <dt>{t('certs.sha256')}</dt>
          <dd className="mono break">{info.fingerprintSha256}</dd>
        </dl>
      ) : null}
    </div>
  );
}
