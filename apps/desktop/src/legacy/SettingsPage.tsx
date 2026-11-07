import { useCallback, useEffect, useState } from 'react';
import { VscColorMode, VscFolderOpened, VscGlobe, VscLightbulb, VscTrash } from 'react-icons/vsc';
import styles from './SettingsPage.module.css';
import { UpdateCard } from '../components/UpdateCard';
import { addSource, listSources, removeSource } from '../api';
import type { AppInfo, RegistrySource, Theme } from '../types';
import type { Language } from '../i18n';

const THEMES: Array<{ id: Theme; label: string; Icon: typeof VscColorMode }> = [
  { id: 'dark', label: 'Dark', Icon: VscColorMode },
  { id: 'light', label: 'Light', Icon: VscLightbulb },
];

const LANGUAGES: Array<{ id: Language; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'zh-CN', label: '简体中文' },
];

const COPY = {
  en: {
    settings: 'Settings',
    appearance: 'Appearance',
    theme: 'Theme',
    themeDesc: 'Choose the color theme used across the shell and tools.',
    dark: 'Dark',
    light: 'Light',
    language: 'Language',
    languageDesc: 'Interface language for the shell, settings, and built-in tools.',
    registries: 'Marketplace registries',
    emptyTitle: 'No registries yet',
    emptyDesc: 'Add a registry.json URL to browse and install marketplace plugins.',
    addRegistry: 'Add registry',
    addRegistryDesc: 'HTTPS registry URL; loopback HTTP is allowed for local development.',
    add: 'Add',
    adding: 'Adding…',
    trust: 'Trust options',
    hideTrust: 'Hide trust options',
    signed: 'Signed',
    removeRegistry: 'Remove registry',
    keyLabel: 'Ed25519 public key (Base64, optional)',
    keyPlaceholder: '32-byte Base64 public key',
    requireSignature: 'Reject packages unless their signature verifies',
    updates: 'Updates',
    about: 'About',
    productDesc: 'A plugin-first developer toolbox built with Rust and Tauri 2.',
    version: 'Version',
    platform: 'Platform',
    dataDir: 'Data directory',
  },
  'zh-CN': {
    settings: '设置',
    appearance: '外观',
    theme: '主题',
    themeDesc: '选择界面与工具使用的颜色主题。',
    dark: '深色',
    light: '浅色',
    language: '语言',
    languageDesc: '界面、设置与内置工具使用的语言。',
    registries: '应用市场注册表',
    emptyTitle: '暂无注册表',
    emptyDesc: '添加 registry.json 地址以浏览并安装市场插件。',
    addRegistry: '添加注册表',
    addRegistryDesc: 'HTTPS 注册表地址；本地开发允许回环 HTTP。',
    add: '添加',
    adding: '添加中…',
    trust: '信任选项',
    hideTrust: '收起信任选项',
    signed: '已签名',
    removeRegistry: '移除注册表',
    keyLabel: 'Ed25519 公钥（Base64，可选）',
    keyPlaceholder: '32 字节 Base64 公钥',
    requireSignature: '签名无效时拒绝安装',
    updates: '更新',
    about: '关于',
    productDesc: '基于 Rust + Tauri 2 的插件优先开发者工具箱。',
    version: '版本',
    platform: '平台',
    dataDir: '数据目录',
  },
} as const;

export default function SettingsPage({
  appInfo,
  theme,
  language,
  onTheme,
  onLanguage,
}: {
  appInfo: AppInfo | null;
  theme: Theme;
  language: Language;
  onTheme: (next: Theme) => void;
  onLanguage: (next: Language) => void;
}) {
  const copy = COPY[language];
  const [sources, setSources] = useState<RegistrySource[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [requireSignature, setRequireSignature] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSources = useCallback(async () => {
    try {
      setSources(await listSources());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  const submitSource = async () => {
    const url = sourceUrl.trim();
    if (!url || busy) return;
    const key = publicKey.trim();
    if (requireSignature && !key) {
      setError('Signature enforcement needs a public key.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await addSource(url, { publicKey: key || undefined, requireSignature });
      setSourceUrl('');
      setPublicKey('');
      setRequireSignature(false);
      setShowTrust(false);
      await loadSources();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.heading}>
          <h1>{copy.settings}</h1>
          <span className={styles.headingMeta}>{appInfo ? `v${appInfo.version}` : ''}</span>
        </header>

        {error ? <div className={styles.notice}>{error}</div> : null}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.appearance}</h2>
          <div className={styles.group}>
            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.theme}</h3>
                <p>{copy.themeDesc}</p>
              </div>
              <div className={styles.segmented} role="group" aria-label="Theme">
                {THEMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-active={theme === item.id ? '1' : '0'}
                    aria-pressed={theme === item.id}
                    onClick={() => onTheme(item.id)}
                  >
                    <item.Icon />
                    {item.id === 'dark' ? copy.dark : copy.light}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.language}</h3>
                <p>{copy.languageDesc}</p>
              </div>
              <div className={styles.segmented} role="group" aria-label="Language">
                {LANGUAGES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-active={language === item.id ? '1' : '0'}
                    aria-pressed={language === item.id}
                    onClick={() => onLanguage(item.id)}
                  >
                    <VscGlobe />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.registries}</h2>
          <div className={styles.group}>
            {sources.length === 0 ? (
              <div className={styles.row}>
                <div className={styles.rowCopy}>
                  <h3>{copy.emptyTitle}</h3>
                  <p>{copy.emptyDesc}</p>
                </div>
              </div>
            ) : (
              sources.map((source) => (
                <div key={source.id} className={styles.row}>
                  <div className={styles.rowCopy}>
                    <h3>
                      {source.name}
                      {source.requireSignature ? <span className={styles.badge}>{copy.signed}</span> : null}
                    </h3>
                    <p className={styles.mono}>{source.url}</p>
                  </div>
                  <button
                    type="button"
                    className={styles.iconBtn}
                    aria-label={`Remove ${source.name}`}
                    title={copy.removeRegistry}
                    onClick={() => {
                      void removeSource(source.id)
                        .then(loadSources)
                        .catch((reason: unknown) =>
                          setError(reason instanceof Error ? reason.message : String(reason)),
                        );
                    }}
                  >
                    <VscTrash />
                  </button>
                </div>
              ))
            )}

            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.addRegistry}</h3>
                <p>{copy.addRegistryDesc}</p>
              </div>
              <div className={styles.inlineForm}>
                <input
                  className={styles.input}
                  value={sourceUrl}
                  placeholder="https://example.com/registry.json"
                  spellCheck={false}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitSource();
                  }}
                />
                <button
                  type="button"
                  className={styles.primaryBtn}
                  disabled={busy}
                  onClick={() => void submitSource()}
                >
                  {busy ? copy.adding : copy.add}
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => setShowTrust((value) => !value)}
                >
                  {showTrust ? copy.hideTrust : copy.trust}
                </button>
              </div>
            </div>

            {showTrust ? (
              <div className={styles.trustRow}>
                <label className={styles.field}>
                  <span>{copy.keyLabel}</span>
                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={publicKey}
                    placeholder={copy.keyPlaceholder}
                    spellCheck={false}
                    onChange={(event) => setPublicKey(event.target.value)}
                  />
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={requireSignature}
                    onChange={(event) => setRequireSignature(event.target.checked)}
                  />
                  {copy.requireSignature}
                </label>
              </div>
            ) : null}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.updates}</h2>
          <div className={`${styles.group} ${styles.updateSlot}`}>
            <UpdateCard currentVersion={appInfo?.version} />
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.about}</h2>
          <div className={styles.group}>
            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>DevToolBox</h3>
                <p>{copy.productDesc}</p>
              </div>
            </div>
            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.version}</h3>
              </div>
              <span className={styles.value}>{appInfo?.version ?? '—'}</span>
            </div>
            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.platform}</h3>
              </div>
              <span className={styles.value}>{appInfo ? `${appInfo.platform} / ${appInfo.arch}` : '—'}</span>
            </div>
            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.dataDir}</h3>
                <p className={styles.mono}>{appInfo?.dataDir ?? '—'}</p>
              </div>
              <VscFolderOpened className={styles.rowIcon} />
            </div>
          </div>
          <div className={styles.versionLine}>
            <span>DevToolBox</span>
            <span>{appInfo ? `v${appInfo.version}` : ''}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
