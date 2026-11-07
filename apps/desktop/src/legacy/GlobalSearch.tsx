import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VscSearch } from 'react-icons/vsc';
import styles from './GlobalSearch.module.css';
import type { LegacyModule } from './data';

interface SearchItem {
  module: LegacyModule;
  categoryId: string;
  categoryName: string;
}

export default function GlobalSearch({
  items,
  onSelect,
  onClose,
}: {
  items: SearchItem[];
  onSelect: (categoryId: string, moduleId: string) => void;
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return items.filter(
      ({ module }) =>
        module.name.toLowerCase().includes(term) ||
        module.id.toLowerCase().includes(term) ||
        module.description.toLowerCase().includes(term),
    );
  }, [items, searchTerm]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const selectResult = useCallback(
    (index: number) => {
      const item = results[index];
      if (item) {
        onSelect(item.categoryId, item.module.id);
        onClose();
      }
    },
    [results, onSelect, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (!results.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev < results.length - 1 ? prev + 1 : 0;
          listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => {
          const next = prev > 0 ? prev - 1 : results.length - 1;
          listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
          return next;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectResult(activeIndex);
      }
    },
    [results, activeIndex, selectResult, onClose],
  );

  return (
    <div
      className={styles.overlay}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.container}>
        <div className={styles.inputWrap}>
          <span className={styles.icon}>
            <VscSearch />
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            placeholder="Search tools…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search tools"
          />
          <span className={styles.shortcut}>ESC</span>
        </div>
        {results.length > 0 ? (
          <ul className={styles.results} ref={listRef} role="listbox">
            {results.map(({ module, categoryName }, index) => (
              <li key={module.id} role="option" aria-selected={index === activeIndex}>
                <button
                  className={`${styles.resultItem}${index === activeIndex ? ` ${styles.resultActive}` : ''}`}
                  onClick={() => selectResult(index)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className={styles.resultIcon}>{module.icon || '🔧'}</span>
                  <span className={styles.resultText}>
                    <span className={styles.resultName}>{module.name}</span>
                    <span className={styles.resultDesc}>
                      {categoryName} · {module.description}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : searchTerm.trim() ? (
          <p className={styles.empty}>No tools match “{searchTerm}”.</p>
        ) : null}
      </div>
    </div>
  );
}
