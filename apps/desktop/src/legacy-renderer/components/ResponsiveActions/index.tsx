// @ts-nocheck
import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from 'react';
import styles from './ResponsiveActions.module.css';
import { useI18n } from '../../i18n';
import { ToolButton } from '@@components';
import { VscChevronDown, VscEllipsis } from 'react-icons/vsc';

export interface ActionItem {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'default';
  icon?: ReactNode;
  subActions?: { label: string; onClick: () => void; disabled?: boolean; icon?: ReactNode }[];
}

interface ResponsiveActionsProps {
  actions: ActionItem[];
  compactWidth?: number;
}

export default function ResponsiveActions({ actions, compactWidth = 420 }: ResponsiveActionsProps) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [subMenuIndex, setSubMenuIndex] = useState<number | null>(null);
  const [overflowMenuOpen, setOverflowMenuOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(actions.length);
  const actionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overflowBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = wrapRef.current?.parentElement;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [compactWidth]);

  useEffect(() => {
    if (subMenuIndex === null && !overflowMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setSubMenuIndex(null);
        setOverflowMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [subMenuIndex, overflowMenuOpen]);

  const handleAction = (action: ActionItem) => {
    if (action.disabled) return;
    action.onClick();
    setSubMenuIndex(null);
    setOverflowMenuOpen(false);
  };

  const renderSubActions = (action: ActionItem, idx: number) => {
    if (!action.subActions?.length) return null;
    return (
      <div className={styles.splitWrap} key={action.label}>
        <ToolButton
          className={`${styles.btn} ${styles.splitMain}${action.active ? ` ${styles.btnActive}` : ''}`}
          onClick={action.onClick}
          disabled={action.disabled}
          title={action.label}
          variant={action.variant}
        >
          {action.icon}
          {action.label}
        </ToolButton>
        <ToolButton
          className={`${styles.btn} ${styles.splitToggle}`}
          onClick={() => setSubMenuIndex(subMenuIndex === idx ? null : idx)}
          aria-label={`${action.label} more options`}
          disabled={action.disabled}
        >
          <VscChevronDown />
        </ToolButton>
        {subMenuIndex === idx && (
          <div className={styles.subDropdown}>
            {action.subActions.map((sub) => (
              <button
                key={sub.label}
                className={styles.dropdownItem}
                onClick={() => {
                  if (!sub.disabled) sub.onClick();
                  setSubMenuIndex(null);
                }}
                disabled={sub.disabled}
              >
                {sub.icon ? <span className={styles.dropdownIcon}>{sub.icon}</span> : null}
                {sub.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  useLayoutEffect(() => {
    if (containerWidth <= 0) return;
    const gap = 4;
    const widths = actions.map((_, i) => actionRefs.current[i]?.offsetWidth ?? 0);
    const overflowBtnWidth = overflowBtnRef.current?.offsetWidth ?? 0;

    const calcTotal = (count: number, hasOverflow: boolean) => {
      const base = widths.slice(0, count).reduce((a, b) => a + b, 0);
      const gaps = Math.max(0, count - 1) * gap;
      const extra = hasOverflow ? overflowBtnWidth + (count > 0 ? gap : 0) : 0;
      return base + gaps + extra;
    };

    let nextVisible = actions.length;
    if (calcTotal(nextVisible, false) > containerWidth) {
      while (nextVisible > 0 && calcTotal(nextVisible, true) > containerWidth) {
        nextVisible -= 1;
      }
    }
    if (nextVisible !== visibleCount) {
      setVisibleCount(nextVisible);
      setSubMenuIndex(null);
      setOverflowMenuOpen(false);
    }
  }, [actions, containerWidth, visibleCount]);

  const visibleActions = actions.slice(0, visibleCount);
  const overflowActions = actions.slice(visibleCount);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={styles.measureRow}>
        {actions.map((a, i) => (
          <div
            key={a.label}
            className={styles.measureItem}
            ref={(el) => {
              actionRefs.current[i] = el;
            }}
          >
            {a.subActions?.length ? (
              renderSubActions(a, i)
            ) : (
              <ToolButton
                className={styles.btn}
                onClick={() => {}}
                disabled
                title={a.label}
                variant={a.variant}
              >
                {a.icon}
                {a.label}
              </ToolButton>
            )}
          </div>
        ))}
        <ToolButton
          className={`${styles.btn} ${styles.moreBtn}`}
          ref={overflowBtnRef}
          onClick={() => {}}
          disabled
        >
          <VscEllipsis />
          <span className={styles.moreText}>{t('actions.more')}</span>
        </ToolButton>
      </div>

      <div className={styles.actions}>
        {visibleActions.map((a, i) => {
          const idx = i;
          return a.subActions?.length ? (
            renderSubActions(a, idx)
          ) : (
            <ToolButton
              key={a.label}
              className={`${styles.btn}${a.active ? ` ${styles.btnActive}` : ''}`}
              onClick={a.onClick}
              disabled={a.disabled}
              title={a.label}
              variant={a.variant}
            >
              {a.icon}
              {a.label}
            </ToolButton>
          );
        })}

        {overflowActions.length > 0 && (
          <div className={styles.menuWrap}>
            <ToolButton
              className={`${styles.btn} ${styles.moreBtn}`}
              onClick={() => setOverflowMenuOpen(!overflowMenuOpen)}
              aria-label={t('actions.moreActions')}
              title={t('actions.more')}
            >
              <VscEllipsis />
              <span className={styles.moreText}>{t('actions.more')}</span>
            </ToolButton>
            {overflowMenuOpen && (
              <div className={styles.dropdown}>
                {overflowActions.map((a) => (
                  <div key={a.label}>
                    <button
                      className={`${styles.dropdownItem} ${a.active ? styles.dropdownItemActive : ''}`}
                      onClick={() => handleAction(a)}
                      disabled={a.disabled}
                    >
                      {a.icon ? <span className={styles.dropdownIcon}>{a.icon}</span> : null}
                      {a.label}
                    </button>
                    {a.subActions?.map((sub) => (
                      <button
                        key={sub.label}
                        className={`${styles.dropdownItem} ${styles.subItem}`}
                        onClick={() => {
                          if (!sub.disabled) sub.onClick();
                          setOverflowMenuOpen(false);
                        }}
                        disabled={sub.disabled}
                      >
                        {sub.icon ? <span className={styles.dropdownIcon}>{sub.icon}</span> : null}
                        {sub.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
