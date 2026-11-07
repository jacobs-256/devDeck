import { useEffect, useMemo, useRef, useState } from 'react';
import { VscClose, VscEllipsis } from 'react-icons/vsc';
import styles from './ToolTabs.module.css';
import { categoryColor, type Category, type LegacyModule } from './data';

export type OpenTool = { categoryId: string; module: LegacyModule };

export default function ToolTabs({
  categories,
  opened,
  activeToolId,
  onActivate,
  onClose,
  onCloseAll,
}: {
  categories: Category[];
  opened: OpenTool[];
  activeToolId: string | null;
  onActivate: (toolId: string) => void;
  onClose: (toolId: string) => void;
  onCloseAll?: () => void;
}) {
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const [showMenu, setShowMenu] = useState(false);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!showMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMenu]);

  useEffect(() => {
    if (!activeToolId) return;
    const el = tabRefs.current[activeToolId];
    if (!el) return;
    requestAnimationFrame(() => {
      tabRefs.current[activeToolId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    });
  }, [activeToolId, opened.length]);

  return (
    <div className={styles.bar}>
      <div className={styles.tabs}>
        {opened.map((t, idx) => {
          const isActive = t.module.id === activeToolId;
          const color = categoryColor(t.categoryId);
          const cat = categoryMap.get(t.categoryId as never);
          return (
            <div
              key={t.module.id}
              ref={(el) => {
                tabRefs.current[t.module.id] = el;
              }}
              className={styles.tabWrap}
              style={{
                background: isActive ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                borderLeft: idx > 0 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <button
                type="button"
                className={styles.tab}
                onClick={() => onActivate(t.module.id)}
                style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-quaternary)' }}
                title={cat ? `${cat.name} · ${t.module.name}` : t.module.name}
              >
                <span className={styles.dot} style={{ background: `${color}15`, color }}>
                  {t.module.icon}
                </span>
                <span className={styles.label}>{t.module.name}</span>
              </button>
              <button
                type="button"
                className={styles.close}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.module.id);
                }}
                aria-label="Close tab"
              >
                <VscClose />
              </button>
              {isActive && <span className={styles.activeLine} style={{ background: color }} />}
            </div>
          );
        })}
      </div>

      <div className={styles.menuWrap}>
        <button
          type="button"
          className={styles.menuBtn}
          data-active={showMenu ? '1' : '0'}
          onClick={() => setShowMenu((v) => !v)}
        >
          <VscEllipsis />
        </button>
        {showMenu && (
          <>
            <button
              type="button"
              className={styles.backdrop}
              onClick={() => setShowMenu(false)}
              aria-label="Close menu"
            />
            <div className={styles.menu}>
              <div className={styles.menuTitle}>Opened Tools ({opened.length})</div>
              {onCloseAll && opened.length > 0 && (
                <div className={styles.menuActions}>
                  <button
                    type="button"
                    className={styles.menuActionBtn}
                    onClick={() => {
                      onCloseAll();
                      setShowMenu(false);
                    }}
                  >
                    Close All
                  </button>
                </div>
              )}
              <div className={styles.menuList}>
                {opened.map((t) => {
                  const isActive = t.module.id === activeToolId;
                  const color = categoryColor(t.categoryId);
                  return (
                    <div key={t.module.id} className={styles.menuItemRow}>
                      <button
                        type="button"
                        className={styles.menuItem}
                        data-active={isActive ? '1' : '0'}
                        onClick={() => {
                          onActivate(t.module.id);
                          setShowMenu(false);
                          tabRefs.current[t.module.id]?.scrollIntoView({
                            behavior: 'smooth',
                            block: 'nearest',
                            inline: 'center',
                          });
                        }}
                      >
                        <span className={styles.menuIcon} style={{ background: `${color}15`, color }}>
                          {t.module.icon}
                        </span>
                        <span className={styles.menuLabel}>{t.module.name}</span>
                        {isActive && <span className={styles.menuDot} style={{ background: color }} />}
                      </button>
                      <button
                        type="button"
                        className={styles.menuClose}
                        aria-label="Close tab"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClose(t.module.id);
                          if (opened.length === 1) setShowMenu(false);
                        }}
                      >
                        <VscClose />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
