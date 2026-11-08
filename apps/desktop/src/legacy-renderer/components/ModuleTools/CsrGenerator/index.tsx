// @ts-nocheck
import { useState } from 'react';
import { useI18n, getModuleLocale } from '../../../i18n';
import styles from './CsrGenerator.module.css';

const KEY_SIZES = [2048, 3072, 4096];

export default function CsrGenerator() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'CsrGenerator');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [commonName, setCommonName] = useState('');
  const [organization, setOrganization] = useState('');
  const [organizationalUnit, setOrganizationalUnit] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [locality, setLocality] = useState('');
  const [keySize, setKeySize] = useState(2048);
  const [privateKey, setPrivateKey] = useState('');
  const [csr, setCsr] = useState('');
  const [activeTab, setActiveTab] = useState<'csr' | 'key'>('csr');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await window.electronAPI?.generateCSR({
        commonName: commonName.trim() || undefined,
        organization: organization.trim() || undefined,
        organizationalUnit: organizationalUnit.trim() || undefined,
        country: country.trim() || undefined,
        state: state.trim() || undefined,
        locality: locality.trim() || undefined,
        keySize,
      });
      if (result?.success) {
        setPrivateKey(result.privateKey ?? '');
        setCsr(result.csr ?? '');
        setActiveTab('csr');
      } else {
        setError(result?.error ?? mt('generateFailed'));
      }
    } catch {
      setError(mt('generateFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const currentOutput = activeTab === 'csr' ? csr : privateKey;

  const handleCopy = () => {
    if (currentOutput) void navigator.clipboard.writeText(currentOutput);
  };

  const handleSave = async () => {
    if (!currentOutput) return;
    const ext = activeTab === 'csr' ? 'csr' : 'key';
    const name =
      activeTab === 'csr' ? `${commonName || 'certificate'}.csr` : `${commonName || 'private'}.key`;
    await window.electronAPI?.saveFileAs(name, currentOutput, [
      { name: ext.toUpperCase() + ' ' + mt('fileLabel'), extensions: [ext, 'pem'] },
    ]);
  };

  return (
    <div className={styles.container}>
      <div className={styles.body}>
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>
              {mt('commonName')} <span className={styles.optional}>{mt('optional')}</span>
            </label>
            <input
              className={styles.input}
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder="example.com"
              spellCheck={false}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              {mt('organization')} <span className={styles.optional}>{mt('optional')}</span>
            </label>
            <input
              className={styles.input}
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              placeholder={mt('placeholderOrg')}
              spellCheck={false}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              {mt('organizationalUnit')} <span className={styles.optional}>{mt('optional')}</span>
            </label>
            <input
              className={styles.input}
              value={organizationalUnit}
              onChange={(e) => setOrganizationalUnit(e.target.value)}
              placeholder={mt('placeholderOU')}
              spellCheck={false}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              {mt('country')} <span className={styles.optional}>{mt('optionalCountry')}</span>
            </label>
            <input
              className={styles.input}
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
              placeholder="CN"
              spellCheck={false}
              maxLength={2}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              {mt('state')} <span className={styles.optional}>{mt('optional')}</span>
            </label>
            <input
              className={styles.input}
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder={mt('placeholderState')}
              spellCheck={false}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              {mt('locality')} <span className={styles.optional}>{mt('optional')}</span>
            </label>
            <input
              className={styles.input}
              value={locality}
              onChange={(e) => setLocality(e.target.value)}
              placeholder={mt('placeholderCity')}
              spellCheck={false}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{mt('keySize')}</label>
            <select
              className={styles.select}
              value={keySize}
              onChange={(e) => setKeySize(Number(e.target.value))}
            >
              {KEY_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} bit
                </option>
              ))}
            </select>
          </div>
          {error && <div className={styles.error}>{error}</div>}
          <button className={styles.generateBtn} onClick={handleGenerate} disabled={generating}>
            {generating ? mt('generating') : mt('generate')}
          </button>
        </div>

        <div className={styles.output}>
          <div className={styles.tabs}>
            <button
              className={`${styles.tab} ${activeTab === 'csr' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('csr')}
            >
              CSR
            </button>
            <button
              className={`${styles.tab} ${activeTab === 'key' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('key')}
            >
              {mt('tabKey')}
            </button>
          </div>
          {currentOutput ? (
            <>
              <div className={styles.outputActions}>
                <button className={styles.actionBtn} onClick={handleCopy}>
                  {mt('copy')}
                </button>
                <button className={styles.actionBtn} onClick={handleSave}>
                  {mt('save')}
                </button>
              </div>
              <div className={styles.outputArea}>
                <pre className={styles.outputText}>{currentOutput}</pre>
              </div>
            </>
          ) : (
            <div className={styles.outputArea}>
              <div className={styles.placeholder}>{mt('emptyHint')}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
