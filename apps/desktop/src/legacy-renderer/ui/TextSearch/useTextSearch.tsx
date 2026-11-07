// @ts-nocheck
import { useState, useEffect, useMemo, useCallback, useRef, type ReactNode, type RefObject } from 'react';

export interface TextSearchResult {
  /** Whether the search bar is visible */
  visible: boolean;
  /** Search term */
  searchTerm: string;
  /** Current highlighted match index */
  currentIndex: number;
  /** Total match count */
  matchCount: number;
  /** Match ranges */
  matches: { start: number; end: number }[];
  /** Search input ref */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Highlight overlay ref */
  overlayRef: RefObject<HTMLDivElement | null>;
  /** Open the search UI */
  open: () => void;
  /** Close the search UI */
  close: () => void;
  /** Set the search term */
  setSearchTerm: (term: string) => void;
  /** Previous match */
  prev: () => void;
  /** Next match */
  next: () => void;
  /** Keydown handler for the target container (intercepts Cmd/Ctrl+F) */
  handleKeyDown: (e: React.KeyboardEvent) => void;
  /** Keydown handler for the search input (Enter/Escape) */
  handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Highlight overlay content; null means no overlay should be rendered */
  highlightContent: ReactNode;
  /** Whether the underlying text should be transparent so the overlay is visible */
  isTransparent: boolean;
}

/**
 * Text search hook.
 *
 * Provides Cmd/Ctrl+F search for plain text content: match highlighting, navigation, and scroll sync via overlay.
 *
 * @param text - Text content to search
 * @param textareaRef - Target element ref for focus and scroll sync
 * @param markClass - CSS class for non-active matches
 * @param activeMarkClass - CSS class for the active match
 */
export function useTextSearch(
  text: string,
  textareaRef: RefObject<HTMLElement | null>,
  markClass: string,
  activeMarkClass: string,
): TextSearchResult {
  const [visible, setVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Compute matches
  const matches = useMemo(() => {
    if (!searchTerm || !text) return [];
    const result: { start: number; end: number }[] = [];
    const term = searchTerm.toLowerCase();
    const lower = text.toLowerCase();
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      result.push({ start: idx, end: idx + searchTerm.length });
      idx = lower.indexOf(term, idx + 1);
    }
    return result;
  }, [searchTerm, text]);

  // Reset index when matches change
  useEffect(() => {
    setCurrentIndex(0);
  }, [matches.length]);

  const open = useCallback(() => {
    setVisible(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setSearchTerm('');
    setCurrentIndex(0);
    textareaRef.current?.focus();
  }, [textareaRef]);

  const prev = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length);
  }, [matches.length]);

  const next = useCallback(() => {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matches.length);
  }, [matches.length]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        open();
      }
    },
    [open],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        next();
      }
    },
    [close, next],
  );

  // Sync overlay scroll with the target element
  useEffect(() => {
    const el = textareaRef.current;
    const overlay = overlayRef.current;
    if (!el || !overlay || !visible) return;
    const sync = () => {
      overlay.scrollTop = el.scrollTop;
      overlay.scrollLeft = el.scrollLeft;
    };
    el.addEventListener('scroll', sync, { passive: true });
    return () => el.removeEventListener('scroll', sync);
  }, [visible, textareaRef]);

  // Scroll to the current match when navigating
  useEffect(() => {
    if (!visible || matches.length === 0) return;
    const el = textareaRef.current;
    if (!el) return;
    const match = matches[currentIndex];
    if (!match) return;
    const linesBefore = text.slice(0, match.start).split('\n').length - 1;
    const lineHeightRaw = getComputedStyle(el).lineHeight;
    const lineHeight = Number.parseFloat(lineHeightRaw) || 20;
    const targetScroll = linesBefore * lineHeight - el.clientHeight / 2;
    el.scrollTop = Math.max(0, targetScroll);
  }, [currentIndex, matches, visible, text, textareaRef]);

  // Build highlight overlay content
  const highlightContent = useMemo(() => {
    if (!visible || !searchTerm || matches.length === 0) return null;
    const parts: ReactNode[] = [];
    let lastEnd = 0;
    matches.forEach((m, i) => {
      if (m.start > lastEnd) parts.push(text.slice(lastEnd, m.start));
      const cls = i === currentIndex ? activeMarkClass : markClass;
      parts.push(
        <mark key={i} className={cls}>
          {text.slice(m.start, m.end)}
        </mark>,
      );
      lastEnd = m.end;
    });
    if (lastEnd < text.length) parts.push(text.slice(lastEnd));
    return parts;
  }, [visible, searchTerm, matches, currentIndex, text, markClass, activeMarkClass]);

  return {
    visible,
    searchTerm,
    currentIndex,
    matchCount: matches.length,
    matches,
    searchInputRef,
    overlayRef,
    open,
    close,
    setSearchTerm,
    prev,
    next,
    handleKeyDown,
    handleSearchKeyDown,
    highlightContent,
    isTransparent: visible && matches.length > 0,
  };
}
