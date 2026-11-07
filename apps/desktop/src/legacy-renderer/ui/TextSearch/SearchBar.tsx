// @ts-nocheck
import type { TextSearchResult } from './useTextSearch';
import styles from './TextSearch.module.css';
import { VscChevronDown, VscChevronUp, VscChromeClose } from 'react-icons/vsc';

interface SearchBarProps {
  search: TextSearchResult;
}

/**
 * Search bar component used with useTextSearch.
 *
 * ```tsx
 * const search = useTextSearch(text, textareaRef, s.mark, s.markActive);
 * {search.visible && <SearchBar search={search} />}
 * ```
 */
export default function SearchBar({ search }: SearchBarProps) {
  return (
    <div className={styles.searchBar}>
      <input
        ref={search.searchInputRef as React.RefObject<HTMLInputElement>}
        className={styles.searchInput}
        type="text"
        value={search.searchTerm}
        onChange={(e) => search.setSearchTerm(e.target.value)}
        onKeyDown={search.handleSearchKeyDown}
        placeholder="Find..."
        spellCheck={false}
        autoFocus
      />
      <span className={styles.searchInfo}>
        {search.matchCount > 0 ? `${search.currentIndex + 1}/${search.matchCount}` : '0/0'}
      </span>
      <button className={styles.searchBtn} onClick={search.prev} aria-label="Previous">
        <VscChevronUp />
      </button>
      <button className={styles.searchBtn} onClick={search.next} aria-label="Next">
        <VscChevronDown />
      </button>
      <button className={styles.searchBtn} onClick={search.close} aria-label="Close Search">
        <VscChromeClose />
      </button>
    </div>
  );
}
