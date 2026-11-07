import { useCallback, useEffect, useState } from 'react';
import { VscFolderOpened, VscInfo, VscLink, VscSettingsGear, VscSync, VscTrash } from 'react-icons/vsc';
import styles from './SettingsPage.module.css';
import { UpdateCard } from '../components/UpdateCard';
import { addSource, listSources, removeSource } from '../api';
import type { AppInfo, RegistrySource, Theme } from '../types';
import type { Language } from '../i18n';

type SectionId = 'general' | 'registries' | 'updates' | 'about';

const NAV: Array<{ id: SectionId; label: string; Icon: typeof VscSettingsGear; group: string }> = [
  { id: 'general', label: 'General', Icon: VscSettingsGear, group: 'App' },
  { id: 'registries', label: 'Registries', Icon: VscLink, group: 'App' },
  { id: 'updates', label: 'Updates', Icon: VscSync, group: 'System' },
  { id: 'about', label: 'About', Icon: VscInfo, group: 'About' },
];

const GROUPS = ['App', 'System', 'About'];

const THEMES: Array<{ id: Theme; label: string }> = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

const LANGUAGES: Array<{ id: Language; label: string; sub: string }> = [
  { id: 'en', label: 'English', sub: 'Default language' },
  { id: 'zh-CN', label: '简体中文', sub: 'Simplified Chinese' },
];

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
  const [active, setActive] = useState<SectionId>('general');
  const [sources, setSources] = useState<RegistrySource[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [error, setError] = useState('');

  const loadSources = useCallback(async () => {
    try {
      setSources(await listSources());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, []);

  useEffect(() => {
    if (active === 'registries') void loadSources();
  }, [active, loadSources]);

  const activeNav = NAV.find((item) => item.id === active);

  const description: Record<SectionId, string> = {
    general: 'Appearance and language preferences.',
    registries: 'Marketplace registries the app can install from.',
    updates: 'Check for and install DevToolBox updates.',
    about: 'Version, platform, and storage information.',
  };

  return (
    <div className={styles.page}>
      <aside className={styles.nav}>
        <div className={styles.navHeader}>
          <div className={styles.navTitle}>Settings</div>
          <div className={styles.navSub}>{appInfo ? `v${appInfo.version}` : '—'}</div>
        </div>

        {GROUPS.map((group) => (
          <div key={group} className={styles.navGroup}>
            <div className={styles.navGroupTitle}>{group}</div>
            <div className={styles.navList}>
              {NAV.filter((item) => item.group === group).map((item) => {
                const isActive = active === item.id;
                const Icon = item.Icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.navItem}
                    data-active={isActive ? '1' : '0'}
                    onClick={() => setActive(item.id)}
                  >
                    {isActive && <span className={styles.navIndicator} />}
                    <Icon className={styles.navIcon} />
                    <span className={styles.navLabel}>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      <main className={styles.content}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.headerIcon}>{activeNav ? <activeNav.Icon /> : null}</div>
              <div>
                <div className={styles.headerTitle}>{activeNav?.label ?? 'Settings'}</div>
                <div className={styles.headerSub}>{description[active]}</div>
              </div>
            </div>
          </div>

          {error ? <div className={styles.notice}>{error}</div> : null}

          {active === 'general' && (
            <div className={styles.stack}>
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <div className={styles.cardTitle}>Theme</div>
                    <div className={styles.cardSub}>Choose how DevToolBox looks.</div>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.themeRow}>
                    {THEMES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.themeCard}
                        data-active={theme === item.id ? '1' : '0'}
                        onClick={() => onTheme(item.id)}
                      >
                        <div className={styles.themePreview} data-theme={item.id}>
                          <div className={styles.tpTop} />
                          <div className={styles.tpBody}>
                            <div className={styles.tpSide} />
                            <div className={styles.tpMain} />
                          </div>
                        </div>
                        <div className={styles.themeLabel}>{item.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <div className={styles.cardTitle}>Language</div>
                    <div className={styles.cardSub}>Interface language for the shell and tools.</div>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.langList}>
                    {LANGUAGES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={styles.langItem}
                        data-active={language === item.id ? '1' : '0'}
                        onClick={() => onLanguage(item.id)}
                      >
                        <span className={styles.radio} data-active={language === item.id ? '1' : '0'}>
                          <span className={styles.radioDot} data-active={language === item.id ? '1' : '0'} />
                        </span>
                        <span className={styles.langText}>
                          <span className={styles.langLabel}>{item.label}</span>
                          <span className={styles.langSub}>{item.sub}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {active === 'registries' && (
            <div className={styles.stack}>
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <div className={styles.cardTitle}>Registries</div>
                    <div className={styles.cardSub}>
                      Registry URLs are plain registry.json files served over HTTPS.
                    </div>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  {sources.length === 0 ? (
                    <div className={styles.notice}>No registries configured yet.</div>
                  ) : (
                    sources.map((source) => (
                      <div key={source.id} className={styles.row}>
                        <div className={styles.rowText}>
                          <div className={styles.rowLabel}>{source.name}</div>
                          <div className={styles.rowDesc}>{source.url}</div>
                        </div>
                        <div className={styles.rowRight}>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => void removeSource(source.id).then(loadSources)}
                            aria-label="Remove registry"
                          >
                            <VscTrash />
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  <div className={styles.divider} />
                  <div className={styles.row}>
                    <input
                      className={styles.input}
                      value={sourceUrl}
                      placeholder="https://example.com/registry.json"
                      onChange={(e) => setSourceUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      className={styles.smallBtn}
                      onClick={() => {
                        const url = sourceUrl.trim();
                        if (!url) return;
                        void addSource(url)
                          .then(() => {
                            setSourceUrl('');
                            return loadSources();
                          })
                          .catch((reason: unknown) =>
                            setError(reason instanceof Error ? reason.message : String(reason)),
                          );
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {active === 'updates' && (
            <div className={styles.stack}>
              <UpdateCard currentVersion={appInfo?.version} />
            </div>
          )}

          {active === 'about' && (
            <div className={styles.stack}>
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <div className={styles.cardTitle}>DevToolBox</div>
                    <div className={styles.cardSub}>Plugin-first desktop toolbox on Rust + Tauri 2.</div>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <div className={styles.rowLabel}>Version</div>
                    </div>
                    <div className={styles.rowRight}>{appInfo?.version ?? '—'}</div>
                  </div>
                  <div className={styles.divider} />
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <div className={styles.rowLabel}>Platform</div>
                    </div>
                    <div className={styles.rowRight}>
                      {appInfo ? `${appInfo.platform} / ${appInfo.arch}` : '—'}
                    </div>
                  </div>
                  <div className={styles.divider} />
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <div className={styles.rowLabel}>Data directory</div>
                      <div className={styles.rowDesc}>{appInfo?.dataDir ?? '—'}</div>
                    </div>
                  </div>
                  <div className={styles.divider} />
                  <div className={styles.row}>
                    <div className={styles.rowText}>
                      <div className={styles.rowLabel}>
                        <VscFolderOpened /> Storage
                      </div>
                      <div className={styles.rowDesc}>Settings, plugins, logs, and SSH known hosts.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
