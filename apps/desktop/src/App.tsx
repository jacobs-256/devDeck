import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type { FormEvent } from 'react';
import {
  addSource,
  appInfo,
  diagnostics,
  installFromBytes,
  installFromFolder,
  installFromRegistry,
  listPlugins,
  listSources,
  refreshCatalog,
  removeSource,
  setLanguage,
  setPluginEnabled,
  setTheme,
  uninstallPlugin,
  validateRegistry,
} from './api';
import brandMark from './assets/brand-mark.svg';
import {
  TRUST_LABELS,
  catalogCategories,
  filterCatalog,
  trustLevel,
  validatePublicKey,
} from './marketplace/registry.model';
import { I18nProvider, LANGUAGES, translate, type Language, type Translate } from './i18n';
import { PluginConsent } from './components/PluginConsent';
import { PluginFrame } from './components/PluginFrame';
import { compareVersions } from './marketplace/version';
import { UpdateCard } from './components/UpdateCard';
import ToolsView from './tools/ToolsView';
import { normalizeError } from './pluginBridge';
import type {
  AppInfo,
  CatalogEntry,
  Diagnostics,
  InstalledPlugin,
  RegistryReport,
  RegistrySource,
  SourceError,
  Theme,
} from './types';
import { authorName } from './types';

type View = 'tools' | 'market' | 'settings';
type MarketTab = 'catalog' | 'installed';

interface Notice {
  tone: 'info' | 'error';
  text: string;
}

function errorText(error: unknown): string {
  const normalized = normalizeError(error);
  return `${normalized.code}: ${normalized.message}`;
}

export default function App() {
  const [view, setView] = useState<View>('tools');
  const [tab, setTab] = useState<MarketTab>('catalog');
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [sources, setSources] = useState<RegistrySource[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogErrors, setCatalogErrors] = useState<SourceError[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourcePublicKey, setSourcePublicKey] = useState('');
  const [requireSignature, setRequireSignature] = useState(false);
  const [showTrustOptions, setShowTrustOptions] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<string | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [theme, setThemeState] = useState<Theme>('dark');
  const [language, setLanguageState] = useState<Language>('en');
  const t: Translate = useMemo(() => (key, vars) => translate(language, key, vars), [language]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState<InstalledPlugin | null>(null);
  const [consent, setConsent] = useState<{
    entry: CatalogEntry;
    mode: 'install' | 'details';
  } | null>(null);
  const [registry, setRegistry] = useState<RegistryReport | null>(null);
  const themeInitialized = useRef(false);
  const installInput = useRef<HTMLInputElement>(null);
  const registryInput = useRef<HTMLInputElement>(null);

  const refreshInstalled = useCallback(async () => {
    try {
      const [nextPlugins, nextInfo] = await Promise.all([listPlugins(), appInfo()]);
      setPlugins(nextPlugins);
      setInfo(nextInfo);
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  }, []);

  const refreshCatalogData = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await refreshCatalog(null);
      setCatalog(result.entries);
      setCatalogErrors(result.errors);
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [nextPlugins, nextInfo, nextSources] = await Promise.all([
          listPlugins(),
          appInfo(),
          listSources(),
        ]);
        if (cancelled) return;
        setPlugins(nextPlugins);
        setInfo(nextInfo);
        setSources(nextSources);
        if (nextSources.length > 0) {
          const result = await refreshCatalog(null);
          if (cancelled) return;
          setCatalog(result.entries);
          setCatalogErrors(result.errors);
        }
      } catch (error) {
        if (!cancelled) setNotice({ tone: 'error', text: errorText(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!info || themeInitialized.current) return;
    themeInitialized.current = true;
    setThemeState(info.theme === 'light' ? 'light' : 'dark');
    setLanguageState(info.language === 'zh-CN' ? 'zh-CN' : 'en');
  }, [info]);

  useEffect(() => {
    if (view !== 'settings') return;
    let cancelled = false;
    diagnostics()
      .then((next) => {
        if (!cancelled) setDiag(next);
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice({ tone: 'error', text: errorText(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  const visibleCatalog = useMemo(
    () => filterCatalog(catalog, catalogQuery, catalogCategory),
    [catalog, catalogQuery, catalogCategory],
  );
  const catalogCategoryOptions = useMemo(() => catalogCategories(catalog), [catalog]);

  const installedById = useMemo(() => {
    const map = new Map<string, InstalledPlugin>();
    for (const plugin of plugins) map.set(plugin.manifest.id, plugin);
    return map;
  }, [plugins]);

  const installedCountForSource = useCallback(
    (sourceId: string) =>
      plugins.filter((plugin) => plugin.source.kind === 'registry' && plugin.source.value === sourceId)
        .length,
    [plugins],
  );

  const onAddSource = async (event: FormEvent) => {
    event.preventDefault();
    const url = sourceUrl.trim();
    if (!url) return;

    const keyCheck = validatePublicKey(sourcePublicKey);
    if (!keyCheck.ok) {
      setNotice({ tone: 'error', text: keyCheck.error });
      return;
    }
    if (requireSignature && !keyCheck.value) {
      setNotice({ tone: 'error', text: 'Signature enforcement needs a public key' });
      return;
    }

    setBusy(true);
    try {
      const source = await addSource(url, {
        publicKey: keyCheck.value ?? undefined,
        requireSignature,
      });
      setSourceUrl('');
      setSourcePublicKey('');
      setRequireSignature(false);
      setShowTrustOptions(false);
      setSources(await listSources());
      setNotice({ tone: 'info', text: t('sources.added', { name: source.name }) });
      await refreshCatalogData();
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const onRefreshSource = async (source: RegistrySource) => {
    setRefreshing(true);
    try {
      const result = await refreshCatalog(source.id);
      setCatalog((entries) => [
        ...entries.filter((entry) => entry.sourceId !== source.id),
        ...result.entries,
      ]);
      setCatalogErrors((errors) => [
        ...errors.filter((error) => error.sourceId !== source.id),
        ...result.errors,
      ]);
      setNotice({ tone: 'info', text: t('sources.refreshed', { name: source.name }) });
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setRefreshing(false);
    }
  };

  const onRemoveSource = async (source: RegistrySource) => {
    try {
      await removeSource(source.id);
      setSources(await listSources());
      setCatalog((entries) => entries.filter((entry) => entry.sourceId !== source.id));
      setCatalogErrors((errors) => errors.filter((error) => error.sourceId !== source.id));
      setNotice({ tone: 'info', text: t('sources.removed', { name: source.name }) });
      await refreshCatalogData();
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  };

  const installEntry = async (entry: CatalogEntry) => {
    setBusy(true);
    try {
      const installed = await installFromRegistry(entry.sourceId, entry.manifest.id, entry.manifest.version);
      setNotice({
        tone: 'info',
        text: t('notice.installed', {
          name: installed.manifest.name,
          version: installed.manifest.version,
        }),
      });
      setConsent(null);
      await refreshInstalled();
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const onInstallFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t('action.installFolder'),
      });
      if (!selected || Array.isArray(selected)) return;

      setBusy(true);
      const installed = await installFromFolder(selected);
      setNotice({
        tone: 'info',
        text: t('notice.devInstalled', {
          name: installed.manifest.name,
          version: installed.manifest.version,
        }),
      });
      await refreshInstalled();
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
    }
  };

  const onInstall = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const installed = await installFromBytes(bytes);
      setNotice({
        tone: 'info',
        text: `Installed ${installed.manifest.name} ${installed.manifest.version}`,
      });
      await refreshInstalled();
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      setBusy(false);
      if (installInput.current) installInput.current.value = '';
    }
  };

  const onValidateRegistry = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setRegistry(await validateRegistry(bytes));
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    } finally {
      if (registryInput.current) registryInput.current.value = '';
    }
  };

  const onToggle = async (plugin: InstalledPlugin) => {
    try {
      const updated = await setPluginEnabled(plugin.manifest.id, !plugin.enabled);
      setNotice({
        tone: 'info',
        text: updated.enabled
          ? t('notice.enabled', { name: updated.manifest.name })
          : t('notice.disabled', { name: updated.manifest.name }),
      });
      await refreshInstalled();
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  };

  const onUninstall = async (plugin: InstalledPlugin) => {
    try {
      await uninstallPlugin(plugin.manifest.id);
      if (running?.manifest.id === plugin.manifest.id) setRunning(null);
      setNotice({ tone: 'info', text: t('notice.removed', { name: plugin.manifest.name }) });
      await refreshInstalled();
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  };

  const onLanguage = async (next: Language) => {
    setLanguageState(next);
    try {
      await setLanguage(next);
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  };

  const onTheme = async (next: Theme) => {
    setThemeState(next);
    try {
      await setTheme(next);
    } catch (error) {
      setNotice({ tone: 'error', text: errorText(error) });
    }
  };

  return (
    <I18nProvider language={language}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <img className="brand-mark" src={brandMark} alt="" width={30} height={30} />
            <span className="brand-name">DevToolBox</span>
            {info ? <span className="version">v{info.version}</span> : null}
          </div>

          <nav>
            <button
              type="button"
              className={view === 'tools' ? 'nav active' : 'nav'}
              aria-current={view === 'tools' ? 'page' : undefined}
              onClick={() => setView('tools')}
            >
              {t('nav.tools')}
            </button>
            <button
              type="button"
              className={view === 'market' ? 'nav active' : 'nav'}
              aria-current={view === 'market' ? 'page' : undefined}
              onClick={() => setView('market')}
            >
              {t('nav.market')}
              <span className="pill">{plugins.length}</span>
            </button>
            <button
              type="button"
              className={view === 'settings' ? 'nav active' : 'nav'}
              aria-current={view === 'settings' ? 'page' : undefined}
              onClick={() => setView('settings')}
            >
              {t('nav.settings')}
            </button>
          </nav>

          <div className="sidebar-footer muted">{info ? `${info.platform} · ${info.arch}` : 'loading…'}</div>
        </aside>

        <main className="content">
          <header className="content-header">
            <div>
              <h1>
                {view === 'tools'
                  ? t('header.tools.title')
                  : view === 'market'
                    ? t('header.market.title')
                    : t('header.settings.title')}
              </h1>
              <p className="muted">
                {view === 'tools'
                  ? t('header.tools.subtitle')
                  : view === 'market'
                    ? t('header.market.subtitle')
                    : t('header.settings.subtitle')}
              </p>
            </div>
            {view === 'market' ? (
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => installInput.current?.click()}
                >
                  {busy ? t('action.working') : t('action.installZip')}
                </button>
                <button type="button" disabled={busy} onClick={() => void onInstallFolder()}>
                  {t('action.installFolder')}
                </button>
                <button type="button" onClick={() => registryInput.current?.click()}>
                  {t('action.validateRegistry')}
                </button>
                <input
                  ref={installInput}
                  type="file"
                  accept=".zip,application/zip"
                  hidden
                  onChange={(event) => void onInstall(event.target.files?.[0])}
                />
                <input
                  ref={registryInput}
                  type="file"
                  accept=".json,application/json"
                  hidden
                  onChange={(event) => void onValidateRegistry(event.target.files?.[0])}
                />
              </div>
            ) : null}
          </header>

          {notice ? (
            <div className={notice.tone === 'error' ? 'notice error' : 'notice'}>
              <span>{notice.text}</span>
              <button type="button" className="link" onClick={() => setNotice(null)}>
                dismiss
              </button>
            </div>
          ) : null}

          {view === 'tools' ? (
            <ToolsView />
          ) : view === 'market' ? (
            <>
              <section className="card sources">
                <div className="sources-header">
                  <h2>{t('sources.title')}</h2>
                  <button
                    type="button"
                    className="ghost"
                    disabled={refreshing || sources.length === 0}
                    onClick={() => void refreshCatalogData()}
                  >
                    {refreshing ? t('sources.refreshing') : t('sources.refresh')}
                  </button>
                </div>

                {sources.length === 0 ? (
                  <p className="muted">{t('sources.empty')}</p>
                ) : (
                  <ul className="source-list">
                    {sources.map((source) => (
                      <li key={source.id}>
                        <div>
                          <strong>{source.name}</strong>
                          <span className="badge">{TRUST_LABELS[trustLevel(source)]}</span>
                          <div className="muted small url">{source.url}</div>
                        </div>
                        <div className="source-actions">
                          <span className="muted small">
                            {t('sources.installedCount', {
                              count: installedCountForSource(source.id),
                            })}
                          </span>
                          <button
                            type="button"
                            className="ghost"
                            disabled={refreshing}
                            onClick={() => void onRefreshSource(source)}
                          >
                            {t('sources.refresh')}
                          </button>
                          <button
                            type="button"
                            className="ghost danger"
                            onClick={() => void onRemoveSource(source)}
                          >
                            {t('sources.remove')}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <form className="add-source" onSubmit={(event) => void onAddSource(event)}>
                  <div className="add-source-row">
                    <input
                      type="url"
                      placeholder="https://example.com/marketplace/registry.json"
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      disabled={busy}
                    />
                    <button type="submit" className="primary" disabled={busy || !sourceUrl.trim()}>
                      {t('sources.add')}
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setShowTrustOptions((value) => !value)}
                    >
                      {showTrustOptions ? t('sources.hideTrustOptions') : t('sources.trustOptions')}
                    </button>
                  </div>

                  {showTrustOptions ? (
                    <div className="trust-options">
                      <label className="field">
                        <span className="field-label">{t('sources.publicKeyLabel')}</span>
                        <textarea
                          className="mono"
                          rows={3}
                          placeholder={t('sources.publicKeyPlaceholder')}
                          value={sourcePublicKey}
                          spellCheck={false}
                          onChange={(event) => setSourcePublicKey(event.target.value)}
                          disabled={busy}
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={requireSignature}
                          onChange={(event) => setRequireSignature(event.target.checked)}
                          disabled={busy}
                        />
                        {t('sources.requireSignature')}
                      </label>
                      <p className="muted small">{t('sources.digestNote')}</p>
                    </div>
                  ) : null}
                </form>
              </section>

              {catalogErrors.length > 0 ? (
                <section className="card">
                  <h2>{t('errors.title')}</h2>
                  <ul className="issues">
                    {catalogErrors.map((error) => (
                      <li key={error.sourceId} className="error">
                        <code>{error.sourceName}</code> {error.message}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {registry ? (
                <section className="card">
                  <h2>
                    Registry {registry.name ? `“${registry.name}”` : ''}{' '}
                    <span className={registry.valid ? 'badge ok' : 'badge bad'}>
                      {registry.valid ? t('registry.valid') : t('registry.invalid')}
                    </span>
                  </h2>
                  <p className="muted">{t('registry.releases', { count: registry.pluginCount })}</p>
                  {registry.issues.length ? (
                    <ul className="issues">
                      {registry.issues.map((issue, index) => (
                        <li key={`${issue.code}-${index}`} className={issue.severity}>
                          <code>{issue.field}</code> {issue.message}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">{t('registry.noIssues')}</p>
                  )}
                </section>
              ) : null}

              <div className="tabs">
                <button
                  type="button"
                  className={tab === 'catalog' ? 'tab active' : 'tab'}
                  onClick={() => setTab('catalog')}
                >
                  {t('tab.catalog')}{' '}
                  <span className="pill">
                    {catalogQuery || catalogCategory
                      ? `${visibleCatalog.length}/${catalog.length}`
                      : catalog.length}
                  </span>
                </button>
                <button
                  type="button"
                  className={tab === 'installed' ? 'tab active' : 'tab'}
                  onClick={() => setTab('installed')}
                >
                  {t('tab.installed')} <span className="pill">{plugins.length}</span>
                </button>
              </div>

              {tab === 'catalog' ? (
                <>
                  {catalog.length > 0 ? (
                    <div className="catalog-filters">
                      <input
                        type="search"
                        placeholder={t('catalog.searchPlaceholder')}
                        value={catalogQuery}
                        onChange={(event) => setCatalogQuery(event.target.value)}
                      />
                      <select
                        value={catalogCategory ?? ''}
                        onChange={(event) => setCatalogCategory(event.target.value || null)}
                      >
                        <option value="">{t('catalog.allCategories')}</option>
                        {catalogCategoryOptions.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <section className="grid">
                    {visibleCatalog.length === 0 ? (
                      <div className="empty">
                        <h2>{t('catalog.emptyTitle')}</h2>
                        <p className="muted">
                          {sources.length === 0
                            ? t('catalog.emptyNoSources')
                            : refreshing
                              ? t('catalog.emptyRefreshing')
                              : catalog.length > 0
                                ? t('catalog.emptyNoMatch')
                                : t('catalog.emptyNoReleases')}
                        </p>
                      </div>
                    ) : (
                      visibleCatalog.map((entry) => {
                        const installed = installedById.get(entry.manifest.id);
                        const updateAvailable =
                          installed !== undefined &&
                          compareVersions(entry.manifest.version, installed.manifest.version) > 0;
                        const isCurrent =
                          installed !== undefined &&
                          compareVersions(entry.manifest.version, installed.manifest.version) <= 0;

                        return (
                          <article
                            key={`${entry.sourceId}-${entry.manifest.id}`}
                            className="card plugin-card"
                          >
                            <header>
                              <div>
                                <h2>{entry.manifest.name}</h2>
                                <p className="muted small">
                                  {entry.manifest.id} · v{entry.manifest.version} ·{' '}
                                  {authorName(entry.manifest.author)}
                                </p>
                              </div>
                              <div className="badges">
                                {entry.signed ? <span className="badge ok">signed</span> : null}
                                {updateAvailable ? <span className="badge warn">update</span> : null}
                                {isCurrent ? <span className="badge">installed</span> : null}
                              </div>
                            </header>
                            <p>{entry.manifest.description}</p>
                            <div className="tags">
                              {entry.manifest.permissions.map((permission) => (
                                <code key={permission} className="tag">
                                  {permission}
                                </code>
                              ))}
                            </div>
                            <footer>
                              <button
                                type="button"
                                className="primary"
                                disabled={busy || isCurrent}
                                onClick={() => setConsent({ entry, mode: 'install' })}
                              >
                                {updateAvailable
                                  ? `Update to ${entry.manifest.version}`
                                  : isCurrent
                                    ? t('catalog.installed')
                                    : t('catalog.install')}
                              </button>
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => setConsent({ entry, mode: 'details' })}
                              >
                                {t('catalog.details')}
                              </button>
                              <span className="muted small">
                                {t('catalog.from', { source: entry.sourceName })}
                              </span>
                            </footer>
                          </article>
                        );
                      })
                    )}
                  </section>
                </>
              ) : (
                <section className="grid">
                  {plugins.length === 0 ? (
                    <div className="empty">
                      <h2>{t('installed.emptyTitle')}</h2>
                      <p className="muted">
                        Install from the catalog, or drop in a signed package with “Install .zip”.
                      </p>
                    </div>
                  ) : (
                    plugins.map((plugin) => {
                      const catalogEntry = catalog.find((entry) => entry.manifest.id === plugin.manifest.id);
                      const updateAvailable =
                        catalogEntry !== undefined &&
                        compareVersions(catalogEntry.manifest.version, plugin.manifest.version) > 0;

                      return (
                        <article key={plugin.manifest.id} className="card plugin-card">
                          <header>
                            <div>
                              <h2>{plugin.manifest.name}</h2>
                              <p className="muted small">
                                {plugin.manifest.id} · v{plugin.manifest.version} ·{' '}
                                {authorName(plugin.manifest.author)}
                              </p>
                            </div>
                            <div className="badges">
                              <span className={plugin.enabled ? 'badge ok' : 'badge'}>
                                {plugin.enabled ? 'enabled' : 'disabled'}
                              </span>
                              {updateAvailable ? <span className="badge warn">update</span> : null}
                            </div>
                          </header>
                          <p>{plugin.manifest.description}</p>
                          <div className="tags">
                            {plugin.manifest.permissions.map((permission) => (
                              <code key={permission} className="tag">
                                {permission}
                              </code>
                            ))}
                          </div>
                          <footer>
                            <button
                              type="button"
                              className="primary"
                              disabled={!plugin.enabled}
                              onClick={() => setRunning(plugin)}
                            >
                              Open
                            </button>
                            {updateAvailable && catalogEntry ? (
                              <button
                                type="button"
                                className="ghost"
                                disabled={busy}
                                onClick={() => setConsent({ entry: catalogEntry, mode: 'install' })}
                              >
                                Update
                              </button>
                            ) : null}
                            <button type="button" className="ghost" onClick={() => void onToggle(plugin)}>
                              {plugin.enabled ? t('installed.disable') : t('installed.enable')}
                            </button>
                            <button
                              type="button"
                              className="ghost danger"
                              onClick={() => void onUninstall(plugin)}
                            >
                              Uninstall
                            </button>
                          </footer>
                        </article>
                      );
                    })
                  )}
                </section>
              )}
            </>
          ) : (
            <section className="stack">
              <div className="card">
                <h2>{t('settings.appearance')}</h2>
                <div className="segmented">
                  <button
                    type="button"
                    className={theme === 'dark' ? 'active' : ''}
                    onClick={() => void onTheme('dark')}
                  >
                    {t('settings.dark')}
                  </button>
                  <button
                    type="button"
                    className={theme === 'light' ? 'active' : ''}
                    onClick={() => void onTheme('light')}
                  >
                    {t('settings.light')}
                  </button>
                </div>
              </div>

              <div className="card">
                <h2>{t('settings.language')}</h2>
                <div className="segmented">
                  {LANGUAGES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={language === option.id ? 'active' : ''}
                      onClick={() => void onLanguage(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <UpdateCard currentVersion={info?.version} />

              <div className="card">
                <h2>{t('settings.host')}</h2>
                {info ? (
                  <dl className="kv">
                    <dt>{t('settings.version')}</dt>
                    <dd>{info.version}</dd>
                    <dt>{t('settings.platform')}</dt>
                    <dd>
                      {info.platform} / {info.arch}
                    </dd>
                    <dt>{t('settings.dataDir')}</dt>
                    <dd>
                      <code>{info.dataDir}</code>
                    </dd>
                  </dl>
                ) : (
                  <p className="muted">{t('settings.hostUnavailable')}</p>
                )}
              </div>

              <div className="card">
                <h2>{t('settings.grants')}</h2>
                {diag && diag.plugins.length ? (
                  <ul className="grants">
                    {diag.plugins.map((plugin) => (
                      <li key={plugin.id}>
                        <strong>{plugin.name}</strong>{' '}
                        <span className="muted">
                          {plugin.enabled ? 'enabled' : 'disabled'} ·{' '}
                          {plugin.granted && plugin.granted.length ? plugin.granted.join(', ') : 'no grants'}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">{t('settings.noPlugins')}</p>
                )}
              </div>
            </section>
          )}
        </main>

        {consent ? (
          <PluginConsent
            entry={consent.entry}
            installed={installedById.get(consent.entry.manifest.id)}
            mode={consent.mode}
            busy={busy}
            onConfirm={() => void installEntry(consent.entry)}
            onClose={() => setConsent(null)}
          />
        ) : null}

        {running ? <PluginFrame plugin={running} theme={theme} onClose={() => setRunning(null)} /> : null}
      </div>
    </I18nProvider>
  );
}
