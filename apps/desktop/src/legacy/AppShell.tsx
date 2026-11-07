import { useMemo, useState, type ReactNode } from 'react';
import styles from './AppShell.module.css';
import type { Category } from './data';

export type AppShellNavItemId = 'dashboard' | 'tools' | 'modules' | 'settings';

export interface AppShellNavItem {
  id: AppShellNavItemId;
  label: string;
  icon?: ReactNode;
  badge?: number;
}

export default function AppShell({
  navItems,
  activeNavId,
  onNavSelect,
  categories,
  activeCategoryId,
  onCategorySelect,
  sidebarHidden = false,
  collapsed: collapsedProp,
  onCollapsedChange,
  children,
}: {
  navItems: AppShellNavItem[];
  activeNavId: AppShellNavItemId;
  onNavSelect: (id: AppShellNavItemId) => void;
  categories?: Category[];
  activeCategoryId?: string;
  onCategorySelect?: (categoryId: string) => void;
  sidebarHidden?: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
  children: ReactNode;
}) {
  const [collapsedState, setCollapsedState] = useState(false);
  const collapsed = collapsedProp ?? collapsedState;
  const setCollapsed = (v: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof v === 'function' ? v(collapsed) : v;
    if (collapsedProp === undefined) setCollapsedState(next);
    onCollapsedChange?.(next);
  };
  const isTools = activeNavId === 'tools';
  const toolCategories = categories ?? [];

  const categoryColorMap = useMemo(
    () => ({
      'dev-tools': 'var(--cat-dev)',
      'text-tools': 'var(--cat-text)',
      'network-tools': 'var(--cat-network)',
      'security-tools': 'var(--cat-security)',
      'other-tools': 'var(--cat-other)',
    }),
    [],
  );

  return (
    <div className={styles.shell}>
      <div className={styles.body}>
        {!sidebarHidden && (
          <aside className={styles.sidebar} style={{ width: collapsed ? 52 : 180 }}>
            <div className={styles.navSection}>
              {navItems.map((item) => {
                const active = item.id === activeNavId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`${styles.navItem}${active ? ` ${styles.navItemActive}` : ''}`}
                    onClick={() => onNavSelect(item.id)}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    data-tip={collapsed ? item.label : undefined}
                    style={{
                      justifyContent: collapsed ? 'center' : undefined,
                      paddingLeft: collapsed ? 14 : undefined,
                      paddingRight: collapsed ? 14 : undefined,
                    }}
                  >
                    {active && <span className={styles.navIndicator} />}
                    {item.icon && <span className={styles.navIcon}>{item.icon}</span>}
                    {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
                    {!collapsed && typeof item.badge === 'number' && item.badge > 0 && (
                      <span className={styles.badge}>{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {isTools && (
              <>
                <div className={styles.divider} />
                {!collapsed && <div className={styles.sectionTitle}>Categories</div>}

                <div className={styles.categorySection}>
                  {toolCategories.map((c) => {
                    const active = c.id === activeCategoryId;
                    const isAll = c.id === 'all';
                    const color = isAll
                      ? 'var(--text-primary)'
                      : (categoryColorMap[c.id as keyof typeof categoryColorMap] ?? 'var(--text-tertiary)');
                    const activeBg = isAll ? 'var(--bg-elevated)' : `${color}12`;
                    const activeBorder = isAll ? 'var(--border-subtle)' : `${color}28`;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className={`${styles.categoryItem}${active ? ` ${styles.categoryItemActive}` : ''}`}
                        title={collapsed ? c.name : undefined}
                        data-tip={collapsed ? c.name : undefined}
                        onClick={() => onCategorySelect?.(c.id)}
                        style={{
                          justifyContent: collapsed ? 'center' : undefined,
                          paddingLeft: collapsed ? 0 : undefined,
                          paddingRight: collapsed ? 0 : undefined,
                          color: active
                            ? color
                            : collapsed
                              ? 'var(--text-disabled)'
                              : 'var(--text-quaternary)',
                          background: active ? activeBg : 'transparent',
                          borderColor: active ? activeBorder : 'transparent',
                          boxShadow: active ? '0 8px 24px #00000055' : 'none',
                        }}
                      >
                        <span className={styles.categoryIcon} style={{ color }}>
                          {c.icon}
                        </span>
                        {!collapsed && (
                          <>
                            <span className={styles.categoryLabel}>{c.name}</span>
                            <span
                              className={styles.categoryCount}
                              style={{ color: active ? color : 'var(--border-subtle)' }}
                            >
                              {c.modules.length}
                            </span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className={styles.spacer} />

            <div className={styles.footer}>
              <button
                type="button"
                className={styles.collapseBtn}
                onClick={() => setCollapsed((v) => !v)}
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <span className={styles.collapseIcon}>{collapsed ? '›' : '‹'}</span>
                {!collapsed && <span className={styles.collapseLabel}>Collapse</span>}
              </button>
            </div>
          </aside>
        )}
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
