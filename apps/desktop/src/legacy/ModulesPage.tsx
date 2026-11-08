import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  VscArrowUp,
  VscCheck,
  VscChevronDown,
  VscExtensions,
  VscRefresh,
  VscSearch,
  VscTrash,
} from 'react-icons/vsc';
import styles from './ModulesPage.module.css';
import {
  DEFAULT_REGISTRY_URL,
  addSource,
  formatError,
  installFromRegistry,
  listPlugins,
  listSources,
  refreshCatalog,
  removeSource,
  setPluginEnabled,
  uninstallPlugin,
} from '../api';
import { categoryColor } from './data';
import type { CatalogEntry, InstalledPlugin, RegistrySource } from '../types';

type TabId = 'installed' | 'marketplace';

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((v) => Number.parseInt(v, 10) || 0);
  const right = b.split('.').map((v) => Number.parseInt(v, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

const IS_DEV = import.meta.env.DEV;

export default function ModulesPage({
  onInstalledChange,
}: {
  onInstalledChange: (plugins: InstalledPlugin[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>('installed');
  const [query, setQuery] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [installed, setInstalled] = useState<InstalledPlugin[]>([]);
  const [sources, setSources] = useState<RegistrySource[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [plugins, sourceList, catalogResult] = await Promise.all([
        listPlugins(),
        listSources(),
        refreshCatalog(),
      ]);
      setInstalled(plugins);
      onInstalledChange(plugins);
      setSources(sourceList);
      setCatalog(catalogResult.entries);
      const officialId = sourceList.find((source) => source.url === DEFAULT_REGISTRY_URL)?.id;
      setErrors(
        catalogResult.errors
          .filter((e) => IS_DEV || e.sourceId === officialId)
          .map((e) => `${e.sourceName}: ${e.message}`),
      );
    } catch (reason) {
      setError(formatError(reason));
    }
  }, [onInstalledChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const officialSourceId = sources.find((source) => source.url === DEFAULT_REGISTRY_URL)?.id;
  const visibleSources = IS_DEV ? sources : sources.filter((source) => source.url === DEFAULT_REGISTRY_URL);

  const latestById = useMemo(() => {
    const map = new Map<string, CatalogEntry>();
    for (const entry of catalog) {
      if (!IS_DEV && entry.sourceId !== officialSourceId) continue;
      const current = map.get(entry.manifest.id);
      if (!current || compareVersions(entry.manifest.version, current.manifest.version) > 0) {
        map.set(entry.manifest.id, entry);
      }
    }
    return map;
  }, [catalog, officialSourceId]);

  const installedById = useMemo(() => new Map(installed.map((p) => [p.manifest.id, p])), [installed]);
  const upgrades = useMemo(
    () =>
      installed.filter((plugin) => {
        const latest = latestById.get(plugin.manifest.id);
        return latest ? compareVersions(latest.manifest.version, plugin.manifest.version) > 0 : false;
      }),
    [installed, latestById],
  );

  const q = query.trim().toLowerCase();
  const matches = (name: string, description: string, categoryId: string) =>
    (!q || name.toLowerCase().includes(q) || description.toLowerCase().includes(q)) &&
    (filterCat === 'All' || categoryId === filterCat);

  const filteredInstalled = installed.filter((p) =>
    matches(p.manifest.name, p.manifest.description, p.manifest.categoryId),
  );
  const filteredMarketplace = Array.from(latestById.values()).filter((entry) =>
    matches(entry.manifest.name, entry.manifest.description, entry.manifest.categoryId),
  );

  const cats = useMemo(() => {
    const list =
      activeTab === 'installed'
        ? installed.map((p) => p.manifest.categoryId)
        : Array.from(latestById.values()).map((e) => e.manifest.categoryId);
    return ['All', ...Array.from(new Set(list.filter(Boolean))).sort()];
  }, [activeTab, installed, latestById]);

  const runInstall = async (entry: CatalogEntry) => {
    setBusyId(entry.manifest.id);
    setError('');
    try {
      await installFromRegistry(entry.sourceId, entry.manifest.id, entry.manifest.version);
      await refresh();
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setBusyId(null);
    }
  };

  const upgradeAll = async () => {
    for (const plugin of upgrades) {
      const latest = latestById.get(plugin.manifest.id);
      if (latest) await runInstall(latest);
    }
  };

  const onAddSource = async () => {
    const url = sourceUrl.trim();
    if (!url) return;
    try {
      await addSource(url);
      setSourceUrl('');
      await refresh();
    } catch (reason) {
      setError(formatError(reason));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>
            <VscExtensions size={16} />
          </div>
          <div>
            <div className={styles.headerTitle}>Module Center</div>
            <div className={styles.headerSub}>
              <span className={styles.headerSubStrong}>{installed.length} installed</span>
              <span className={styles.dotSep}>·</span>
              {latestById.size} available
              {upgrades.length > 0 && (
                <>
                  <span className={styles.dotSep}>·</span>
                  <span className={styles.headerWarn}>
                    {upgrades.length} update{upgrades.length > 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => {
            setRefreshing(true);
            void refresh().finally(() => setRefreshing(false));
          }}
          aria-label="Refresh"
        >
          <VscRefresh className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className={styles.registryBar}>
        <div className={styles.registryList}>
          {visibleSources.length === 0 ? (
            <span className={styles.registryEmpty}>No registries yet.</span>
          ) : (
            visibleSources.map((source) => (
              <span key={source.id} className={styles.sourceChip} title={source.url}>
                {source.name}
                {source.requireSignature ? <span className={styles.sourceBadge}>signed</span> : null}
                {IS_DEV ? (
                  <button
                    type="button"
                    className={styles.sourceRemove}
                    aria-label={`Remove ${source.name}`}
                    onClick={() => void removeSource(source.id).then(refresh)}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>
        {IS_DEV ? (
          <div className={styles.registryForm}>
            <input
              className={styles.input}
              value={sourceUrl}
              placeholder="https://example.com/registry.json"
              onChange={(e) => setSourceUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void onAddSource();
              }}
            />
            <button type="button" className={styles.smallBtn} onClick={() => void onAddSource()}>
              Add registry
            </button>
          </div>
        ) : null}
      </div>

      <div className={styles.topbar}>
        <div className={styles.tabs} role="tablist" aria-label="Module tabs">
          {(['installed', 'marketplace'] as const).map((tab) => {
            const active = activeTab === tab;
            const count = tab === 'installed' ? installed.length : latestById.size;
            return (
              <button
                key={tab}
                type="button"
                className={styles.tab}
                data-active={active ? '1' : '0'}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'installed' ? 'Installed' : 'Marketplace'}
                <span className={styles.tabCount} data-active={active ? '1' : '0'}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className={styles.spacer} />

        <div className={styles.filters}>
          <div className={styles.selectWrap}>
            <select
              className={styles.select}
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <VscChevronDown className={styles.selectIcon} />
          </div>

          <div className={styles.search}>
            <VscSearch className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search modules…"
            />
          </div>
        </div>
      </div>

      {(error || errors.length > 0) && <div className={styles.errorBox}>{error || errors.join(' · ')}</div>}

      <div className={styles.list}>
        {activeTab === 'installed' && upgrades.length > 0 && (
          <div className={styles.upgradeBanner}>
            <div className={styles.upgradeLeft}>
              <VscArrowUp className={styles.upgradeIcon} />
              <div className={styles.upgradeText}>
                <span className={styles.upgradeTitle}>
                  {upgrades.length} update{upgrades.length > 1 ? 's' : ''} available
                </span>
                <span className={styles.upgradeSub}>Keep your modules up to date for the latest fixes.</span>
              </div>
            </div>
            <button type="button" className={styles.upgradeBtn} onClick={() => void upgradeAll()}>
              Update All
            </button>
          </div>
        )}

        {activeTab === 'installed' ? (
          <div className={styles.cards}>
            {filteredInstalled.map((plugin) => {
              const latest = latestById.get(plugin.manifest.id);
              const hasUpdate = latest
                ? compareVersions(latest.manifest.version, plugin.manifest.version) > 0
                : false;
              const color = categoryColor(plugin.manifest.categoryId);
              return (
                <div key={plugin.manifest.id} className={styles.card}>
                  <div
                    className={styles.cardIcon}
                    style={{ color, background: `${color}12`, borderColor: `${color}22` }}
                  >
                    <VscExtensions />
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTop}>
                      <div className={styles.cardName}>{plugin.manifest.name}</div>
                      <span className={styles.pill}>v{plugin.manifest.version}</span>
                      {hasUpdate && latest ? (
                        <span className={`${styles.pill} ${styles.pillUpgrade}`}>
                          v{latest.manifest.version}
                        </span>
                      ) : null}
                      <span className={styles.pillCat} style={{ color, background: `${color}12` }}>
                        {plugin.manifest.categoryId}
                      </span>
                      {!plugin.enabled && <span className={styles.pillMuted}>Disabled</span>}
                    </div>
                    <div className={styles.cardDesc}>{plugin.manifest.description}</div>
                    {typeof plugin.manifest.author === 'string' ? (
                      <div className={styles.cardMeta}>by {plugin.manifest.author}</div>
                    ) : null}
                  </div>

                  <div className={styles.actions}>
                    {hasUpdate && latest && (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        data-variant="upgrade"
                        disabled={busyId === plugin.manifest.id}
                        onClick={() => void runInstall(latest)}
                      >
                        <VscArrowUp />
                        Upgrade
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.actionBtn}
                      data-variant={plugin.enabled ? 'enabled' : 'disabled'}
                      onClick={() => void setPluginEnabled(plugin.manifest.id, !plugin.enabled).then(refresh)}
                    >
                      <span className={styles.togglePill} data-enabled={plugin.enabled ? '1' : '0'}>
                        <span className={styles.toggleDot} data-enabled={plugin.enabled ? '1' : '0'} />
                      </span>
                      {plugin.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    <button
                      type="button"
                      className={styles.iconBtn}
                      onClick={() => void uninstallPlugin(plugin.manifest.id).then(refresh)}
                      aria-label="Uninstall"
                    >
                      <VscTrash />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredInstalled.length === 0 && (
              <div className={styles.empty}>
                No installed modules. Browse the Marketplace tab to add some.
              </div>
            )}
          </div>
        ) : (
          <div className={styles.cards}>
            {filteredMarketplace.map((entry) => {
              const installedEntry = installedById.get(entry.manifest.id);
              const hasUpdate = installedEntry
                ? compareVersions(entry.manifest.version, installedEntry.manifest.version) > 0
                : false;
              const color = categoryColor(entry.manifest.categoryId);
              return (
                <div key={entry.manifest.id} className={styles.card}>
                  <div
                    className={styles.cardIcon}
                    style={{ color, background: `${color}12`, borderColor: `${color}22` }}
                  >
                    <VscExtensions />
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardTop}>
                      <div className={styles.cardName}>{entry.manifest.name}</div>
                      <span className={styles.pill}>v{entry.manifest.version}</span>
                      <span className={styles.pillCat} style={{ color, background: `${color}12` }}>
                        {entry.manifest.categoryId}
                      </span>
                      {installedEntry && !hasUpdate && (
                        <span className={styles.pillOk}>
                          <VscCheck /> Installed
                        </span>
                      )}
                    </div>
                    <div className={styles.cardDesc}>{entry.manifest.description}</div>
                    <div className={styles.cardMeta}>
                      from {entry.sourceName}
                      {entry.signed ? ' · signed' : ''}
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.actionBtn}
                      data-variant={installedEntry ? (hasUpdate ? 'upgrade' : 'reinstall') : 'install'}
                      disabled={busyId === entry.manifest.id}
                      onClick={() => void runInstall(entry)}
                    >
                      {installedEntry
                        ? hasUpdate
                          ? 'Upgrade'
                          : 'Reinstall'
                        : busyId === entry.manifest.id
                          ? 'Installing…'
                          : 'Install'}
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredMarketplace.length === 0 && (
              <div className={styles.empty}>
                No marketplace modules. Add a registry URL above and refresh.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
