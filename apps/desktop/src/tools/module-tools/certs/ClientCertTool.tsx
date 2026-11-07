import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { issueCertificate } from './certs.api';

export default function ClientCertTool() {
  const { t } = useI18n();
  const [caCertificatePem, setCaCertificatePem] = useState('');
  const [caPrivateKeyPem, setCaPrivateKeyPem] = useState('');
  const [csrPem, setCsrPem] = useState('');
  const [days, setDays] = useState(365);
  const [clientAuth, setClientAuth] = useState(true);
  const [certificate, setCertificate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onIssue = async () => {
    setBusy(true);
    setError('');
    try {
      setCertificate(await issueCertificate({ caCertificatePem, caPrivateKeyPem, csrPem, days, clientAuth }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setCertificate('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tool-body">
      <label className="field">
        <span className="field-label">{t('certs.caCertificate')}</span>
        <textarea
          className="mono"
          rows={6}
          placeholder="-----BEGIN CERTIFICATE-----"
          value={caCertificatePem}
          spellCheck={false}
          onChange={(event) => setCaCertificatePem(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">{t('certs.caPrivateKey')}</span>
        <textarea
          className="mono"
          rows={6}
          placeholder="-----BEGIN PRIVATE KEY-----"
          value={caPrivateKeyPem}
          spellCheck={false}
          onChange={(event) => setCaPrivateKeyPem(event.target.value)}
        />
      </label>

      <label className="field">
        <span className="field-label">{t('certs.csr')}</span>
        <textarea
          className="mono"
          rows={6}
          placeholder="-----BEGIN CERTIFICATE REQUEST-----"
          value={csrPem}
          spellCheck={false}
          onChange={(event) => setCsrPem(event.target.value)}
        />
      </label>

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
          <span className="field-label">{t('certs.extendedKeyUsage')}</span>
          <select
            value={clientAuth ? 'client' : 'server'}
            onChange={(event) => setClientAuth(event.target.value === 'client')}
          >
            <option value="client">{t('certs.clientAuth')}</option>
            <option value="server">{t('certs.serverAuth')}</option>
          </select>
        </label>
        <button
          type="button"
          className="primary"
          onClick={() => void onIssue()}
          disabled={busy || !caCertificatePem || !caPrivateKeyPem || !csrPem}
        >
          {busy ? t('certs.issuing') : t('certs.issue')}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {certificate ? (
        <div className="field">
          <div className="field-row">
            <span className="field-label">{t('certs.issued')}</span>
            <CopyButton value={certificate} />
          </div>
          <textarea className="mono result" rows={12} readOnly value={certificate} />
        </div>
      ) : null}
    </div>
  );
}
