import { useCallback, useEffect, useState } from 'react';
import {
  VscColorMode,
  VscGlobe,
  VscLightbulb,
  VscSave,
  VscServer,
  VscTextSize,
  VscTrash,
} from 'react-icons/vsc';
import styles from './SettingsPage.module.css';
import { AboutFooter } from '../components/AboutFooter';
import {
  DEFAULT_REGISTRY_URL,
  addSource,
  formatError,
  checkServicePort,
  desktopSettings,
  listSources,
  removeSource,
  saveDesktopSettings,
  serviceStatus,
} from '../api';
import type {
  AppInfo,
  CloseBehavior,
  DesktopSettings,
  LanguageSetting,
  RegistrySource,
  ServiceStatus,
  TextSize,
  ThemeSetting,
} from '../types';

const THEMES: Array<{ id: ThemeSetting; label: string; Icon: typeof VscColorMode }> = [
  { id: 'auto', label: 'Auto', Icon: VscColorMode },
  { id: 'dark', label: 'Dark', Icon: VscColorMode },
  { id: 'light', label: 'Light', Icon: VscLightbulb },
];

const LANGUAGES: Array<{ id: LanguageSetting; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'en', label: 'English' },
  { id: 'zh-CN', label: '简体中文' },
];

const TEXT_SIZES: TextSize[] = ['small', 'default', 'large', 'xlarge'];
const CLOSE_BEHAVIORS: CloseBehavior[] = ['ask', 'tray', 'quit'];

const IS_DEV = import.meta.env.DEV;

const COPY = {
  en: {
    settings: 'Settings',
    appearance: 'Appearance',
    theme: 'Theme',
    themeDesc: 'Follow the system appearance or force a light or dark theme.',
    auto: 'Auto',
    dark: 'Dark',
    light: 'Light',
    language: 'Language',
    languageDesc: 'Follow the system language or choose English / Simplified Chinese.',
    textSize: 'Text size',
    textSizeDesc: 'Scale the interface and built-in tools.',
    sizes: { small: 'Small', default: 'Default', large: 'Large', xlarge: 'Extra large' },
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
    system: 'System',
    servicePort: 'Local service port',
    servicePortDesc:
      'Port for the local status service. Saving restarts the service; auto-pick falls back to a free port when occupied.',
    servicePortPlaceholder: 'Port',
    check: 'Check',
    save: 'Save',
    checking: 'Checking…',
    portAvailable: 'Port available.',
    portBusy: 'Port is already in use.',
    portSaved: 'Service settings saved.',
    currentPort: 'Current port',
    autoPort: 'Pick a free port automatically',
    autoPortDesc: 'When the configured port is busy, use another available port and save it.',
    closeBehavior: 'Window close behavior',
    closeBehaviorDesc: 'Choose what happens when the window close button is clicked.',
    closeAsk: 'Ask every time',
    closeTray: 'Minimize to tray',
    closeQuit: 'Quit app',
    tray: 'Tray icon',
    trayDesc: 'Show an icon in the system tray to show or quit the app quickly.',
    saved: 'Saved.',
  },
  'zh-CN': {
    settings: '设置',
    appearance: '外观',
    theme: '主题',
    themeDesc: '跟随系统外观，或强制使用深色 / 浅色主题。',
    auto: '自动',
    dark: '深色',
    light: '浅色',
    language: '语言',
    languageDesc: '跟随系统语言，或选择 English / 简体中文。',
    textSize: '文字大小',
    textSizeDesc: '缩放界面与内置工具。',
    sizes: { small: '小', default: '默认', large: '大', xlarge: '特大' },
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
    system: '系统',
    servicePort: '本地服务端口',
    servicePortDesc: '本地状态服务端口。保存后自动重启；端口被占用时可自动选择可用端口。',
    servicePortPlaceholder: '端口',
    check: '检测',
    save: '保存',
    checking: '检测中…',
    portAvailable: '端口可用。',
    portBusy: '端口已被占用。',
    portSaved: '服务配置已保存。',
    currentPort: '当前服务端口',
    autoPort: '自动选择可用端口',
    autoPortDesc: '配置端口被占用时自动使用其他可用端口，并保存配置。',
    closeBehavior: '关闭行为',
    closeBehaviorDesc: '选择点击窗口关闭按钮后的应用行为。',
    closeAsk: '每次询问',
    closeTray: '最小化到托盘',
    closeQuit: '退出应用',
    tray: '托盘图标',
    trayDesc: '在系统托盘中显示图标，便于快速显示或退出应用。',
    saved: '已保存。',
  },
} as const;

export default function SettingsPage({
  appInfo,
  themeSetting,
  languageSetting,
  textSize,
  onTheme,
  onLanguage,
  onTextSize,
}: {
  appInfo: AppInfo | null;
  themeSetting: ThemeSetting;
  languageSetting: LanguageSetting;
  textSize: TextSize;
  onTheme: (next: ThemeSetting) => void;
  onLanguage: (next: LanguageSetting) => void;
  onTextSize: (next: TextSize) => void;
}) {
  const language =
    languageSetting === 'auto' ? (navigator.language.startsWith('zh') ? 'zh-CN' : 'en') : languageSetting;
  const copy = COPY[language];
  const [sources, setSources] = useState<RegistrySource[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [requireSignature, setRequireSignature] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [desktop, setDesktop] = useState<DesktopSettings | null>(null);
  const [service, setService] = useState<ServiceStatus | null>(null);
  const [portInput, setPortInput] = useState('8765');
  const [portState, setPortState] = useState<'idle' | 'checking' | 'available' | 'busy'>('idle');
  const [systemStatus, setSystemStatus] = useState('');
  const visibleSources = IS_DEV ? sources : sources.filter((source) => source.url === DEFAULT_REGISTRY_URL);

  const loadSources = useCallback(async () => {
    try {
      setSources(await listSources());
    } catch (reason) {
      setError(formatError(reason));
    }
  }, []);

  useEffect(() => {
    void loadSources();
    void desktopSettings()
      .then((next) => {
        setDesktop(next);
        setPortInput(String(next.servicePort));
      })
      .catch((reason: unknown) => setError(formatError(reason)));
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
      setError(formatError(reason));
    } finally {
      setBusy(false);
    }
  };

  const persistDesktop = async (next: DesktopSettings) => {
    try {
      const saved = await saveDesktopSettings(next);
      setDesktop(saved);
      setPortInput(String(saved.servicePort));
      setService(await serviceStatus());
      setSystemStatus('');
    } catch (reason) {
      setError(formatError(reason));
    }
  };

  const checkPort = async () => {
    setPortState('checking');
    setSystemStatus('');
    try {
      const available = await checkServicePort(Number(portInput));
      setPortState(available ? 'available' : 'busy');
      setSystemStatus(available ? copy.portAvailable : copy.portBusy);
    } catch (reason) {
      setPortState('idle');
      setError(formatError(reason));
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
              <div className={styles.segmented} role="group" aria-label={copy.theme}>
                {THEMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-active={themeSetting === item.id ? '1' : '0'}
                    aria-pressed={themeSetting === item.id}
                    onClick={() => onTheme(item.id)}
                  >
                    <item.Icon />
                    {item.id === 'auto' ? copy.auto : item.id === 'dark' ? copy.dark : copy.light}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.language}</h3>
                <p>{copy.languageDesc}</p>
              </div>
              <div className={styles.segmented} role="group" aria-label={copy.language}>
                {LANGUAGES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    data-active={languageSetting === item.id ? '1' : '0'}
                    aria-pressed={languageSetting === item.id}
                    onClick={() => onLanguage(item.id)}
                  >
                    <VscGlobe />
                    {item.id === 'auto' ? copy.auto : item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.textSize}</h3>
                <p>{copy.textSizeDesc}</p>
              </div>
              <div className={styles.segmented} role="group" aria-label={copy.textSize}>
                {TEXT_SIZES.map((size, index) => (
                  <button
                    key={size}
                    type="button"
                    data-active={textSize === size ? '1' : '0'}
                    aria-pressed={textSize === size}
                    onClick={() => onTextSize(size)}
                  >
                    <VscTextSize size={12 + index * 2} />
                    {copy.sizes[size]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.registries}</h2>
          <div className={styles.group}>
            {visibleSources.length === 0 ? (
              <div className={styles.row}>
                <div className={styles.rowCopy}>
                  <h3>{copy.emptyTitle}</h3>
                  <p>{copy.emptyDesc}</p>
                </div>
              </div>
            ) : (
              visibleSources.map((source) => (
                <div key={source.id} className={styles.row}>
                  <div className={styles.rowCopy}>
                    <h3>
                      {source.name}
                      {source.requireSignature ? <span className={styles.badge}>{copy.signed}</span> : null}
                    </h3>
                    <p className={styles.mono}>{source.url}</p>
                  </div>
                  {IS_DEV ? (
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={`Remove ${source.name}`}
                      title={copy.removeRegistry}
                      onClick={() => {
                        void removeSource(source.id)
                          .then(loadSources)
                          .catch((reason: unknown) => setError(formatError(reason)));
                      }}
                    >
                      <VscTrash />
                    </button>
                  ) : null}
                </div>
              ))
            )}

            {IS_DEV ? (
              <>
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
              </>
            ) : null}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{copy.system}</h2>
          <div className={styles.group}>
            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>
                  <VscServer />
                  {copy.servicePort}
                </h3>
                <p>{copy.servicePortDesc}</p>
                <p>
                  {copy.currentPort}: {service?.activePort ?? desktop?.servicePort ?? '—'}
                </p>
              </div>
              <div className={styles.inlineForm}>
                <input
                  className={`${styles.input} ${styles.portInput}`}
                  type="number"
                  min={1024}
                  max={65535}
                  value={portInput}
                  aria-label={copy.servicePortPlaceholder}
                  onChange={(event) => {
                    setPortInput(event.target.value);
                    setPortState('idle');
                  }}
                />
                <button type="button" className={styles.secondaryBtn} onClick={() => void checkPort()}>
                  {portState === 'checking' ? copy.checking : copy.check}
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    if (!desktop) return;
                    void persistDesktop({
                      ...desktop,
                      servicePort: Number(portInput) || desktop.servicePort,
                    });
                  }}
                >
                  <VscSave />
                  {copy.save}
                </button>
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.autoPort}</h3>
                <p>{copy.autoPortDesc}</p>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={desktop?.serviceAutoPort ?? false}
                  disabled={!desktop}
                  onChange={(event) => {
                    if (!desktop) return;
                    void persistDesktop({ ...desktop, serviceAutoPort: event.target.checked });
                  }}
                />
                <span aria-hidden="true" />
              </label>
            </div>

            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.closeBehavior}</h3>
                <p>{copy.closeBehaviorDesc}</p>
              </div>
              <div className={styles.segmented} role="group" aria-label={copy.closeBehavior}>
                {CLOSE_BEHAVIORS.map((behavior) => {
                  const labels: Record<CloseBehavior, string> = {
                    ask: copy.closeAsk,
                    tray: copy.closeTray,
                    quit: copy.closeQuit,
                  };
                  return (
                    <button
                      key={behavior}
                      type="button"
                      data-active={desktop?.closeBehavior === behavior ? '1' : '0'}
                      aria-pressed={desktop?.closeBehavior === behavior}
                      disabled={behavior === 'tray' && !desktop?.trayEnabled}
                      onClick={() => {
                        if (!desktop) return;
                        void persistDesktop({ ...desktop, closeBehavior: behavior });
                      }}
                    >
                      {labels[behavior]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <h3>{copy.tray}</h3>
                <p>{copy.trayDesc}</p>
              </div>
              <label className={styles.switch}>
                <input
                  type="checkbox"
                  role="switch"
                  checked={desktop?.trayEnabled ?? false}
                  disabled={!desktop}
                  onChange={(event) => {
                    if (!desktop) return;
                    const enabled = event.target.checked;
                    void persistDesktop({
                      ...desktop,
                      trayEnabled: enabled,
                      closeBehavior:
                        !enabled && desktop.closeBehavior === 'tray' ? 'ask' : desktop.closeBehavior,
                    });
                  }}
                />
                <span aria-hidden="true" />
              </label>
            </div>

            {systemStatus ? <p className={styles.systemStatus}>{systemStatus}</p> : null}
          </div>
        </section>

        <AboutFooter name={appInfo?.name} version={appInfo?.version} />
      </div>
    </div>
  );
}
