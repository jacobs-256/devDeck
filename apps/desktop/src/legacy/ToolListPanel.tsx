import { useEffect, useMemo, useRef, useState } from 'react';
import { VscClose, VscSearch } from 'react-icons/vsc';
import styles from './ToolListPanel.module.css';
import { categoryColor, type Category, type LegacyModule } from './data';

export default function ToolListPanel({
  categories,
  activeCategoryId,
  activeToolId,
  onSelectTool,
}: {
  categories: Category[];
  activeCategoryId: string;
  activeToolId: string | null;
  onSelectTool: (categoryId: string, toolId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const tools = useMemo(() => {
    const qq = search.trim().toLowerCase();
    const allModules: Array<{ categoryId: string; categoryName: string; module: LegacyModule }> = [];
    for (const c of categories) {
      if (c.id === 'all') continue;
      if (activeCategoryId !== 'all' && c.id !== activeCategoryId) continue;
      for (const m of c.modules) allModules.push({ categoryId: c.id, categoryName: c.name, module: m });
    }
    if (!qq) return allModules;
    return allModules.filter((x) => {
      const n = String(x.module.name ?? '').toLowerCase();
      const d = String(x.module.description ?? '').toLowerCase();
      return n.includes(qq) || d.includes(qq);
    });
  }, [activeCategoryId, categories, search]);

  const grouped = useMemo(() => {
    if (activeCategoryId !== 'all') {
      return { [activeCategoryId]: tools };
    }
    const map: Record<string, Array<{ categoryId: string; categoryName: string; module: LegacyModule }>> = {};
    for (const t of tools) {
      (map[t.categoryId] ??= []).push(t);
    }
    return map;
  }, [activeCategoryId, tools]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  return (
    <div className={styles.panel}>
      <div className={styles.searchArea}>
        <div
          className={styles.searchBox}
          style={{
            borderColor: search ? 'var(--accent-primary)' : 'var(--border-subtle)',
          }}
        >
          <VscSearch
            className={styles.searchIcon}
            style={{ color: search ? 'var(--accent-secondary)' : 'var(--text-disabled)' }}
          />
          <input
            ref={inputRef}
            className={styles.searchInput}
            value={search}
            placeholder="Search tools…"
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className={styles.clearBtn} onClick={() => setSearch('')}>
              <VscClose />
            </button>
          )}
        </div>
        <div className={styles.searchMeta}>
          <span className={styles.count}>
            <span className={styles.countNum}>{tools.length}</span> tool{tools.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className={styles.list}>
        {Object.entries(grouped).map(([catId, catTools]) => {
          const cat = categoryById.get(catId as never);
          const dotColor = categoryColor(catId);
          return (
            <div key={catId}>
              {activeCategoryId === 'all' && (
                <div className={styles.groupHeader}>
                  <span className={styles.groupDot} style={{ background: dotColor }} />
                  <span className={styles.groupLabel}>{cat?.name ?? catId}</span>
                  <span className={styles.groupCount}>{catTools.length}</span>
                </div>
              )}

              {catTools.map(({ categoryId, module }) => {
                const active = activeToolId === module.id;
                const color = categoryColor(categoryId);
                return (
                  <button
                    key={module.id}
                    type="button"
                    className={styles.toolItem}
                    onClick={() => onSelectTool(module.categoryId || categoryId, module.id)}
                    style={{
                      background: active ? 'var(--bg-secondary)' : 'transparent',
                      borderLeftColor: active ? color : 'transparent',
                    }}
                  >
                    <div
                      className={styles.toolIconWrap}
                      style={{ background: `${color}15`, borderColor: `${color}25` }}
                    >
                      <span className={styles.toolIcon} style={{ color }}>
                        {module.icon}
                      </span>
                    </div>
                    <div className={styles.toolText}>
                      <div
                        className={styles.toolName}
                        style={{ color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                      >
                        {module.name}
                      </div>
                      <div className={styles.toolDesc}>{module.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}

        {tools.length === 0 && (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <VscSearch />
            </div>
            <div className={styles.emptyTitle}>
              No tools found
              {search ? (
                <>
                  {' '}
                  for <span className={styles.emptyQuery}>"{search}"</span>
                </>
              ) : null}
            </div>
            {search && (
              <button type="button" className={styles.emptyAction} onClick={() => setSearch('')}>
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
