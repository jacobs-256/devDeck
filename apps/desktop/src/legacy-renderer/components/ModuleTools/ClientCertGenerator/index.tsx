// @ts-nocheck
import { useState } from 'react';
import { useI18n, getModuleLocale } from '../../../i18n';
import styles from './ClientCertGenerator.module.css';

const KEY_SIZES = [2048, 3072, 4096];
const VALIDITY_KEYS: { labelKey: string; days: number }[] = [
  { labelKey: 'year1', days: 365 },
  { labelKey: 'year2', days: 730 },
  { labelKey: 'year5', days: 1825 },
  { labelKey: 'year10', days: 3650 },
];

type TabId = 'cert' | 'key' | 'csr' | 'csrKey';

export default function ClientCertGenerator() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'ClientCertGenerator');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [caCert, setCaCert] = useState('');
  const [caKey, setCaKey] = useState('');
  const [csrInput, setCsrInput] = useState('');
  const [commonName, setCommonName] = useState('');
  const [organization, setOrganization] = useState('');
  const [organizationalUnit, setOrganizationalUnit] = useState('');
  const [country, setCountry] = useState('');
  const [state, setState] = useState('');
  const [locality, setLocality] = useState('');
  const [keySize, setKeySize] = useState(2048);
  const [validityDays, setValidityDays] = useState(365);

  const [clientCert, setClientCert] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [generatedCsr, setGeneratedCsr] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('cert');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const hasCSR = csrInput.trim().length > 0;

  const loadFile = async (setter: (v: string) => void) => {
    const result = await window.electronAPI?.openFile([
      { name: mt('pemFiles'), extensions: ['pem', 'crt', 'key', 'cer', 'csr'] },
      { name: mt('allFiles'), extensions: ['*'] },
    ]);
    if (result?.content) setter(result.content);
  };

  const handleGenerate = async () => {
    if (!caCert.trim()) {
      setError(mt('errNoCACert'));
      return;
    }
    if (!caKey.trim()) {
      setError(mt('errNoCAKey'));
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const result = await window.electronAPI?.generateClientCert({
        caCertPem: caCert.trim(),
        caKeyPem: caKey.trim(),
        csrPem: csrInput.trim() || undefined,
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
        setClientCert(result.certificate ?? '');
        setClientKey(result.privateKey ?? '');
        setGeneratedCsr(result.csr ?? '');
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

  const tabs: { id: TabId; label: string }[] = hasCSR
    ? [{ id: 'cert', label: mt('tabCert') }]
    : [
        { id: 'cert', label: mt('tabCert') },
        { id: 'key', label: mt('tabKey') },
        { id: 'csr', label: 'CSR' },
      ];

  const outputMap: Record<TabId, string> = {
    cert: clientCert,
    key: clientKey,
    csr: generatedCsr,
    csrKey: clientKey,
  };
  const currentOutput = outputMap[activeTab] ?? '';

  const handleCopy = () => {
    if (currentOutput) void navigator.clipboard.writeText(currentOutput);
  };

  const handleSave = async () => {
    if (!currentOutput) return;
    const extMap: Record<TabId, { ext: string; name: string }> = {
      cert: { ext: 'crt', name: `${commonName || 'client'}.crt` },
      key: { ext: 'key', name: `${commonName || 'client'}.key` },
      csr: { ext: 'csr', name: `${commonName || 'client'}.csr` },
      csrKey: { ext: 'key', name: `${commonName || 'client'}-csr.key` },
    };
    const { ext, name } = extMap[activeTab];
    await window.electronAPI?.saveFileAs(name, currentOutput, [
      { name: ext.toUpperCase() + ' ' + mt('fileLabel'), extensions: [ext, 'pem'] },
    ]);
  };

  return (
    <div className={styles.container}>
      <div className={styles.body}>
        <div className={styles.form}>
          <div className={styles.section}>{mt('sectionCA')}</div>
          <div className={styles.field}>
            <label className={styles.label}>{mt('caCertLabel')}</label>
            <div className={styles.fileRow}>
              <textarea
                className={styles.textarea}
                value={caCert}
                onChange={(e) => setCaCert(e.target.value)}
                placeholder={mt('caCertPlaceholder')}
                spellCheck={false}
              />
              <button className={styles.loadBtn} onClick={() => loadFile(setCaCert)}>
                {mt('import')}
              </button>
            </div>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{mt('caKeyLabel')}</label>
            <div className={styles.fileRow}>
              <textarea
                className={styles.textarea}
                value={caKey}
                onChange={(e) => setCaKey(e.target.value)}
                placeholder={mt('caKeyPlaceholder')}
                spellCheck={false}
              />
              <button className={styles.loadBtn} onClick={() => loadFile(setCaKey)}>
                {mt('import')}
              </button>
            </div>
          </div>

          <div className={styles.section}>
            {mt('sectionCSR')} <span className={styles.optional}>{mt('csrHint')}</span>
          </div>
          <div className={styles.field}>
            <div className={styles.fileRow}>
              <textarea
                className={styles.textarea}
                value={csrInput}
                onChange={(e) => setCsrInput(e.target.value)}
                placeholder={mt('csrPlaceholder')}
                spellCheck={false}
              />
              <button className={styles.loadBtn} onClick={() => loadFile(setCsrInput)}>
                {mt('import')}
              </button>
            </div>
          </div>

          {!hasCSR && (
            <>
              <div className={styles.section}>{mt('sectionClient')}</div>
              <div className={styles.field}>
                <label className={styles.label}>
                  Common Name (CN) <span className={styles.optional}>{mt('optional')}</span>
                </label>
                <input
                  className={styles.input}
                  value={commonName}
                  onChange={(e) => setCommonName(e.target.value)}
                  placeholder="client.example.com"
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
            </>
          )}

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
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
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
