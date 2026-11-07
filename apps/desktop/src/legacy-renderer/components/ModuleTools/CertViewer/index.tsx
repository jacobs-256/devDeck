// @ts-nocheck
import { useState } from 'react';
import type { CertInfo } from '../../../types/electron';
import { useI18n, getModuleLocale } from '../../../i18n';
import styles from './CertViewer.module.css';

export default function CertViewer() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'CertViewer');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [input, setInput] = useState('');
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);
  const [error, setError] = useState('');

  const handleParse = async (pem: string) => {
    if (!pem.trim()) {
      setCertInfo(null);
      setError('');
      return;
    }
    try {
      const result = await window.electronAPI?.parseCert(pem.trim());
      if (result?.success && result.info) {
        setCertInfo(result.info);
        setError('');
      } else {
        setCertInfo(null);
        setError(result?.error ?? mt('cannotParse'));
      }
    } catch {
      setCertInfo(null);
      setError(mt('parseFailed'));
    }
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    if (val.includes('-----END')) void handleParse(val);
  };

  const handleLoadFile = async () => {
    const result = await window.electronAPI?.openFile([
      { name: mt('certFiles'), extensions: ['pem', 'crt', 'cer', 'cert'] },
      { name: mt('allFiles'), extensions: ['*'] },
    ]);
    if (result?.content) {
      setInput(result.content);
      void handleParse(result.content);
    }
  };

  const handleClear = () => {
    setInput('');
    setCertInfo(null);
    setError('');
  };

  const isExpired = certInfo ? new Date(certInfo.validTo) < new Date() : false;

  const dnLabels: Record<string, string> = {
    CN: 'Common Name',
    O: 'Organization',
    OU: 'Organizational Unit',
    C: 'Country',
    ST: 'State',
    L: 'Locality',
  };

  const renderDN = (dn: Record<string, string>) => (
    <table className={styles.table}>
      <tbody>
        {Object.entries(dn).map(([key, value]) => (
          <tr key={key}>
            <td>{dnLabels[key] ?? key}</td>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className={styles.container}>
      <div className={styles.inputPane}>
        <div className={styles.inputHeader}>
          <span className={styles.inputTitle}>{mt('certPem')}</span>
          <div className={styles.inputActions}>
            <button className={styles.actionBtn} onClick={handleLoadFile}>
              {mt('import')}
            </button>
            <button className={styles.actionBtn} onClick={() => handleParse(input)}>
              {mt('parse')}
            </button>
            <button className={styles.actionBtn} onClick={handleClear}>
              {mt('clear')}
            </button>
          </div>
        </div>
        <textarea
          className={styles.textarea}
          value={input}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={mt('placeholder')}
          spellCheck={false}
        />
      </div>

      <div className={styles.outputPane}>
        {!certInfo && !error && <div className={styles.placeholder}>{mt('emptyHint')}</div>}
        {error && <div className={styles.error}>{error}</div>}
        {certInfo && (
          <>
            <div className={styles.section}>
              <div className={styles.sectionTitle}>{mt('status')}</div>
              <div className={styles.statusRow}>
                <span className={`${styles.badge} ${certInfo.isCA ? styles.badgeCA : styles.badgeClient}`}>
                  {certInfo.isCA ? mt('caCert') : mt('endCert')}
                </span>
                <span className={`${styles.badge} ${isExpired ? styles.badgeExpired : styles.badgeValid}`}>
                  {isExpired ? mt('expired') : mt('valid')}
                </span>
              </div>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>{mt('subject')}</div>
              {renderDN(certInfo.subject)}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>{mt('issuer')}</div>
              {renderDN(certInfo.issuer)}
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>{mt('validity')}</div>
              <table className={styles.table}>
                <tbody>
                  <tr>
                    <td>{mt('validFrom')}</td>
                    <td>{certInfo.validFrom}</td>
                  </tr>
                  <tr>
                    <td>{mt('validTo')}</td>
                    <td>{certInfo.validTo}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>{mt('publicKey')}</div>
              <table className={styles.table}>
                <tbody>
                  <tr>
                    <td>{mt('algorithm')}</td>
                    <td>{certInfo.publicKey.algorithm}</td>
                  </tr>
                  <tr>
                    <td>{mt('keySize')}</td>
                    <td>{certInfo.publicKey.size}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>{mt('serialNumber')}</div>
              <table className={styles.table}>
                <tbody>
                  <tr>
                    <td>Serial Number</td>
                    <td>{certInfo.serialNumber}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={styles.section}>
              <div className={styles.sectionTitle}>{mt('fingerprint')}</div>
              <table className={styles.table}>
                <tbody>
                  <tr>
                    <td>SHA-256</td>
                    <td>{certInfo.fingerprint256}</td>
                  </tr>
                  <tr>
                    <td>SHA-1</td>
                    <td>{certInfo.fingerprint}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {certInfo.extensions.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionTitle}>{mt('extensions')}</div>
                <table className={styles.table}>
                  <tbody>
                    {certInfo.extensions.map((ext, i) => (
                      <tr key={i}>
                        <td>{ext.name}</td>
                        <td>{ext.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
