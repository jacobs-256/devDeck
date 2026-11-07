import { useEffect, useMemo, useRef, useState } from 'react';
import {
  VscBroadcast,
  VscChevronRight,
  VscInfo,
  VscScreenFull,
  VscSearch,
  VscSparkle,
} from 'react-icons/vsc';
import styles from './DashboardPage.module.css';
import { categoryColor, type Category } from './data';
import { loadModuleUsage, scoreUsage } from './moduleUsage';

type FlatTool = {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  module: Category['modules'][number];
};

export default function DashboardPage({
  categories,
  appInfo,
  onOpenTool,
  onCategorySelect,
}: {
  categories: Category[];
  appInfo: { version: string; platform: string; arch: string } | null;
  onOpenTool: (categoryId: string, moduleId: string) => void;
  onCategorySelect: (categoryId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const searchItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const flatTools = useMemo<FlatTool[]>(
    () =>
      categories.flatMap((c) =>
        c.modules.map((m) => ({
          categoryId: c.id,
          categoryName: c.name,
          categoryColor: categoryColor(c.id),
          module: m,
        })),
      ),
    [categories],
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return flatTools
      .filter((t) => {
        const name = String(t.module.name ?? '').toLowerCase();
        const desc = String(t.module.description ?? '').toLowerCase();
        return name.includes(q) || desc.includes(q);
      })
      .slice(0, 8);
  }, [flatTools, query]);

  useEffect(() => {
    setActiveSearchIndex(0);
  }, [searchResults]);

  const frequent = useMemo(() => {
    const usage = loadModuleUsage();
    const scored = usage
      .map((u) => ({ ...u, score: scoreUsage(u) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const picked = scored
      .map((u) => flatTools.find((t) => t.categoryId === u.categoryId && t.module.id === u.moduleId))
      .filter(Boolean) as FlatTool[];

    if (picked.length >= 4) return picked;
    const fill = flatTools
      .filter((t) => !picked.some((x) => x.module.id === t.module.id))
      .slice(0, 8 - picked.length);
    return [...picked, ...fill];
  }, [flatTools]);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.headerTopRow}>
            <div className={styles.headerMeta}>
              <div className={styles.headerIcon}>
                <VscSparkle size={15} />
              </div>
              <span className={styles.headerKicker}>Dashboard</span>
            </div>

            <div className={styles.searchWrap} data-focused={focused ? '1' : '0'}>
              <div className={styles.searchBox} data-focused={focused ? '1' : '0'}>
                <VscSearch className={styles.searchIcon} />
                <input
                  ref={searchInputRef}
                  className={styles.searchInput}
                  value={query}
                  placeholder="Search tools…"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveSearchIndex(0);
                  }}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      if (!query) return;
                      e.preventDefault();
                      setQuery('');
                      return;
                    }
                    if (searchResults.length === 0) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setActiveSearchIndex((i) => (i + 1) % searchResults.length);
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setActiveSearchIndex((i) => (i - 1 + searchResults.length) % searchResults.length);
                      return;
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const cur = searchResults[activeSearchIndex];
                      if (!cur) return;
                      setQuery('');
                      setFocused(false);
                      searchInputRef.current?.blur();
                      onOpenTool(cur.categoryId, cur.module.id);
                    }
                  }}
                />
                {query ? (
                  <button className={styles.clearBtn} type="button" onClick={() => setQuery('')}>
                    Clear
                  </button>
                ) : (
                  <kbd className={styles.kbd}>⌘ K</kbd>
                )}
              </div>

              {searchResults.length > 0 && (
                <div className={`${styles.searchDropdown} fade-in`} role="listbox">
                  <div className={styles.searchDropdownTitle}>
                    {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                  </div>
                  {searchResults.map((t, idx) => (
                    <button
                      key={t.module.id}
                      type="button"
                      role="option"
                      aria-selected={idx === activeSearchIndex}
                      className={`${styles.searchItem}${idx === activeSearchIndex ? ` ${styles.searchItemActive}` : ''}`}
                      ref={(el) => {
                        searchItemRefs.current[t.module.id] = el;
                      }}
                      onClick={() => {
                        setQuery('');
                        onOpenTool(t.categoryId, t.module.id);
                      }}
                      onMouseEnter={() => setActiveSearchIndex(idx)}
                    >
                      <div
                        className={styles.searchItemIcon}
                        style={{
                          color: t.categoryColor,
                          background: `${t.categoryColor}18`,
                          borderColor: `${t.categoryColor}30`,
                        }}
                      >
                        {t.module.icon}
                      </div>
                      <div className={styles.searchItemText}>
                        <div className={styles.searchItemName}>{t.module.name}</div>
                        <div className={styles.searchItemDesc}>{t.module.description}</div>
                      </div>
                      <span
                        className={styles.searchItemPill}
                        style={{
                          color: t.categoryColor,
                          background: `${t.categoryColor}15`,
                          borderColor: `${t.categoryColor}25`,
                        }}
                      >
                        {t.categoryName}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <h1 className={styles.headerTitle}>Welcome back 👋</h1>
          <p className={styles.headerSub}>
            {now.toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        <div className={`${styles.quickNav} no-scrollbar`}>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className={styles.quickNavItem}
              onClick={() => onCategorySelect(c.id)}
            >
              <span className={styles.quickNavIcon} style={{ color: categoryColor(c.id) }}>
                {c.icon}
              </span>
              <span className={styles.quickNavLabel}>{c.name}</span>
              <span className={styles.quickNavCount}>{c.modules.length}</span>
            </button>
          ))}
        </div>

        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <VscSparkle />
              <h2>Frequently used</h2>
            </div>
            <button type="button" className={styles.sectionAction} onClick={() => onCategorySelect('all')}>
              View all tools
              <VscChevronRight />
            </button>
          </div>
          <div className={styles.grid}>
            {frequent.map((t) => (
              <button
                key={t.module.id}
                type="button"
                className={styles.toolCard}
                onClick={() => onOpenTool(t.categoryId, t.module.id)}
              >
                <div className={styles.toolCardTop}>
                  <div
                    className={styles.toolCardIcon}
                    style={{
                      color: t.categoryColor,
                      background: `${t.categoryColor}15`,
                      borderColor: `${t.categoryColor}28`,
                    }}
                  >
                    {t.module.icon}
                  </div>
                  <div className={styles.toolCardMeta}>
                    <div className={styles.toolCardName}>{t.module.name}</div>
                    <span
                      className={styles.toolCardPill}
                      style={{ color: t.categoryColor, background: `${t.categoryColor}15` }}
                    >
                      {t.categoryName}
                    </span>
                  </div>
                </div>
                <div className={styles.toolCardDesc}>{t.module.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.simpleWidgetGrid}>
          <div className={styles.widget}>
            <div className={styles.widgetHeader} style={{ borderLeftColor: 'var(--accent-warning)' }}>
              <div className={styles.widgetHeaderLeft}>
                <span className={styles.widgetIcon} style={{ color: 'var(--accent-warning)' }}>
                  <VscInfo />
                </span>
                <span className={styles.widgetTitle}>App info</span>
              </div>
            </div>
            <div className={styles.widgetBody}>
              <div className={styles.infoBody}>
                <InfoRow label="Version" value={appInfo?.version ?? '-'} />
                <InfoRow label="Platform" value={appInfo ? `${appInfo.platform} / ${appInfo.arch}` : '-'} />
                <InfoRow label="Local time" value={now.toLocaleString()} />
                <InfoRow label="Timezone" value={Intl.DateTimeFormat().resolvedOptions().timeZone} />
              </div>
            </div>
          </div>

          <div className={styles.widget}>
            <div className={styles.widgetHeader} style={{ borderLeftColor: 'var(--accent-success)' }}>
              <div className={styles.widgetHeaderLeft}>
                <span className={styles.widgetIcon} style={{ color: 'var(--accent-success)' }}>
                  <VscScreenFull />
                </span>
                <span className={styles.widgetTitle}>Screen</span>
              </div>
            </div>
            <div className={styles.widgetBody}>
              <div className={styles.infoBody}>
                <InfoRow label="Screen size" value={`${window.screen.width} × ${window.screen.height}`} />
                <InfoRow label="Window size" value={`${window.innerWidth} × ${window.innerHeight}`} />
                <InfoRow label="Color depth" value={`${window.screen.colorDepth} bits`} />
                <InfoRow label="Pixel ratio" value={`${window.devicePixelRatio} dppx`} />
              </div>
            </div>
          </div>

          <div className={styles.widget}>
            <div className={styles.widgetHeader} style={{ borderLeftColor: 'var(--accent-secondary)' }}>
              <div className={styles.widgetHeaderLeft}>
                <span className={styles.widgetIcon} style={{ color: 'var(--accent-secondary)' }}>
                  <VscBroadcast />
                </span>
                <span className={styles.widgetTitle}>Runtime</span>
              </div>
            </div>
            <div className={styles.widgetBody}>
              <div className={styles.infoBody}>
                <InfoRow label="Online" value={navigator.onLine ? 'Connected' : 'Disconnected'} />
                <InfoRow label="Languages" value={navigator.languages.join(', ') || navigator.language} />
                <InfoRow label="Vendor" value={navigator.vendor || '-'} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>
        <span className={styles.infoValueText}>{value}</span>
      </span>
    </div>
  );
}
