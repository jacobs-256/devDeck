// @ts-nocheck
import { useState } from 'react';
import { useI18n, getModuleLocale } from '../../../i18n';
import styles from './CaGenerator.module.css';

const KEY_SIZES = [2048, 3072, 4096];
const VALIDITY_KEYS: { labelKey: string; days: number }[] = [
  { labelKey: 'year1', days: 365 },
  { labelKey: 'year2', days: 730 },
  { labelKey: 'year5', days: 1825 },
  { labelKey: 'year10', days: 3650 },
  { labelKey: 'year20', days: 7300 },
  { labelKey: 'year50', days: 18250 },
  { labelKey: 'year100', days: 36500 },
];

export default function CaGenerator() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'CaGenerator');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [commonName, setCommonName] = useState('');
  const [organization, setOrganization] = useState('');
  const [organizationalUnit, setOrganizationalUnit] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [locality, setLocality] = useState('');
  const [keySize, setKeySize] = useState(2048);
  const [validityDays, setValidityDays] = useState(3650);
  const [privateKey, setPrivateKey] = useState('');
  const [certificate, setCertificate] = useState('');
  const [activeTab, setActiveTab] = useState<'cert' | 'key'>('cert');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const result = await window.electronAPI?.generateCA({
        commonName: commonName.trim() || undefined,
        organization: organization.trim() || undefined,
        organizationalUnit: organizationalUnit.trim() || undefined,
        country: country.trim() || undefined,
        state: state.trim() || undefined,
        locality: locality.trim() || undefined,
        keySize,
        validityDays,
      });
      if (result?.success) {
        setPrivateKey(result.privateKey ?? '');
        setCertificate(result.certificate ?? '');
        setActiveTab('cert');
      } else {
        setError(result?.error ?? mt('generateFailed'));
      }
    } catch {
      setError(mt('generateFailed'));
    } finally {
      setGenerating(false);
    }
  };

  const currentOutput = activeTab === 'cert' ? certificate : privateKey;

  const handleCopy = () => {
    if (currentOutput) void navigator.clipboard.writeText(currentOutput);
  };

  const handleSave = async () => {
    if (!currentOutput) return;
    const ext = activeTab === 'cert' ? 'crt' : 'key';
    const name = activeTab === 'cert' ? `${commonName || 'ca'}.crt` : `${commonName || 'ca'}.key`;
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
              Common Name (CN) <span className={styles.optional}>{mt('optional')}</span>
            </label>
            <input
              className={styles.input}
              value={commonName}
              onChange={(e) => setCommonName(e.target.value)}
              placeholder="My Root CA"
              spellCheck={false}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>
              Organization (O) <span className={styles.optional}>{mt('optional')}</span>
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
              Organizational Unit (OU) <span className={styles.optional}>{mt('optional')}</span>
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
              Country (C) <span className={styles.optional}>{mt('optionalCountry')}</span>
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
              State (ST) <span className={styles.optional}>{mt('optional')}</span>
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
              Locality (L) <span className={styles.optional}>{mt('optional')}</span>
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
          <div className={styles.field}>
            <label className={styles.label}>{mt('validity')}</label>
            <select
              className={styles.select}
              value={validityDays}
              onChange={(e) => setValidityDays(Number(e.target.value))}
            >
              {VALIDITY_KEYS.map((o) => (
                <option key={o.days} value={o.days}>
                  {mt(o.labelKey)}
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
              className={`${styles.tab} ${activeTab === 'cert' ? styles.tabActive : ''}`}
              onClick={() => setActiveTab('cert')}
            >
              {mt('tabCert')}
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
