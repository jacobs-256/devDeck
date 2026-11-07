// @ts-nocheck
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import styles from './JsonFormatter.module.css';
import { JsonTreeView, ToolSection } from '@@components';
import ResponsiveActions from '../../ResponsiveActions';
import { useI18n, getModuleLocale } from '../../../i18n';
import {
  VscArrowDown,
  VscChevronDown,
  VscChevronUp,
  VscChromeClose,
  VscCollapseAll,
  VscCopy,
  VscEdit,
  VscFolderOpened,
  VscJson,
  VscOutput,
  VscSave,
  VscSortPrecedence,
  VscTrash,
  VscExpandAll,
} from 'react-icons/vsc';

function textStats(text: string) {
  const length = text.length;
  const spaces = (text.match(/ /g) || []).length;
  const newlines = (text.match(/\n/g) || []).length;
  return { length, spaces, newlines };
}

function useScrollTop(ref: React.RefObject<HTMLElement | null>, threshold = 100) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => setShow(el.scrollTop > threshold);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref, threshold]);
  const scrollToTop = () => ref.current?.scrollTo({ top: 0, behavior: 'smooth' });
  return { show, scrollToTop };
}

function sortJsonKeys(obj: unknown, asc: boolean): unknown {
  if (Array.isArray(obj)) return obj.map((item) => sortJsonKeys(item, asc));
  if (obj !== null && typeof obj === 'object') {
    const keys = Object.keys(obj as Record<string, unknown>).sort();
    if (!asc) keys.reverse();
    return keys.reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortJsonKeys((obj as Record<string, unknown>)[key], asc);
      return acc;
    }, {});
  }
  return obj;
}

export default function JsonFormatter() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'JsonFormatter');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<unknown>(undefined);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sortOrder, setSortOrder] = useState<'none' | 'asc' | 'desc'>('none');
  const [compressed, setCompressed] = useState(false);
  const [expandAll, setExpandAll] = useState(true);
  const [treeKey, setTreeKey] = useState(0);
  const [splitPercent, setSplitPercent] = useState(50);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [outputViewMode, setOutputViewMode] = useState<'tree' | 'text'>('tree');
  const [outputSearchVisible, setOutputSearchVisible] = useState(false);
  const [outputSearchTerm, setOutputSearchTerm] = useState('');
  const [outputCurrentMatchIndex, setOutputCurrentMatchIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outputFocusRef = useRef<HTMLDivElement>(null);
  const outputTreeRef = useRef<HTMLDivElement>(null);
  const outputTextareaRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const outputSearchInputRef = useRef<HTMLInputElement>(null);
  const outputOverlayRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const prevOutputViewMode = useRef<'tree' | 'text'>('tree');

  const inputScroll = useScrollTop(textareaRef);
  const outputScroll = useScrollTop(outputTreeRef);
  const outputTextScroll = useScrollTop(outputTextareaRef);

  const handleMouseDown = () => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(20, percent)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const inputStats = useMemo(() => textStats(input), [input]);

  const displayData = useMemo(() => {
    if (parsed === undefined) return undefined;
    if (sortOrder === 'none') return parsed;
    return sortJsonKeys(parsed, sortOrder === 'asc');
  }, [parsed, sortOrder]);

  const getFormattedText = useCallback(() => {
    if (displayData === undefined) return '';
    return compressed ? JSON.stringify(displayData) : JSON.stringify(displayData, null, 2);
  }, [displayData, compressed]);

  const formattedText = useMemo(() => getFormattedText(), [getFormattedText]);
  const outputStats = useMemo(() => textStats(formattedText), [formattedText]);

  const outputMatches = useMemo(() => {
    if (!outputSearchTerm || !formattedText) return [];
    const result: { start: number; end: number }[] = [];
    const term = outputSearchTerm.toLowerCase();
    const text = formattedText.toLowerCase();
    let idx = text.indexOf(term);
    while (idx !== -1) {
      result.push({ start: idx, end: idx + outputSearchTerm.length });
      idx = text.indexOf(term, idx + 1);
    }
    return result;
  }, [outputSearchTerm, formattedText]);

  useEffect(() => {
    setOutputCurrentMatchIndex(outputMatches.length > 0 ? 0 : 0);
  }, [outputMatches.length]);

  const outputHighlightContent = useMemo(() => {
    if (!outputSearchVisible || !outputSearchTerm || outputMatches.length === 0) return null;
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    outputMatches.forEach((m, i) => {
      if (m.start > lastEnd) {
        parts.push(formattedText.slice(lastEnd, m.start));
      }
      parts.push(
        <mark
          key={i}
          className={i === outputCurrentMatchIndex ? styles.highlightMarkActive : styles.highlightMark}
        >
          {formattedText.slice(m.start, m.end)}
        </mark>,
      );
      lastEnd = m.end;
    });
    if (lastEnd < formattedText.length) {
      parts.push(formattedText.slice(lastEnd));
    }
    return parts;
  }, [outputSearchVisible, outputSearchTerm, outputMatches, outputCurrentMatchIndex, formattedText]);

  const isTextOutput = compressed || outputViewMode === 'text';
  const activeOutputScroll = isTextOutput ? outputTextScroll : outputScroll;

  const handleInputChange = (value: string) => {
    setInput(value);
    setCompressed(false);
    setSortOrder('none');
    if (!value.trim()) {
      setParsed(undefined);
      setError('');
      return;
    }
    // Try parsing directly first
    try {
      setParsed(JSON.parse(value));
      setError('');
      return;
    } catch {
      // If direct parsing fails, try preprocessing (Python-style literals / single quotes, etc.)
    }
    try {
      let fixed = value.trim();
      // If it starts with "{" (not an array) and contains "}, {", wrap it into an array
      if (fixed.startsWith('{') && !fixed.startsWith('[') && /\},\s*\{/.test(fixed)) {
        fixed = `[${fixed}]`;
      }
      // Replace Python-style booleans and None
      fixed = fixed
        .replace(/\bTrue\b/g, 'true')
        .replace(/\bFalse\b/g, 'false')
        .replace(/\bNone\b/g, 'null');
      // Replace single quotes with double quotes (simple heuristic: non-escaped single quotes)
      fixed = fixed.replace(/'/g, '"');
      setParsed(JSON.parse(fixed));
      setError('');
    } catch (e) {
      setError((e as Error).message);
      setParsed(undefined);
    }
  };

  const handleCompress = () => setCompressed(true);
  const handleFormat = () => setCompressed(false);

  const handleCopy = async () => {
    const text = getFormattedText();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const text = getFormattedText();
    if (!text) return;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'formatted.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleExpand = () => {
    setExpandAll((prev) => !prev);
    setTreeKey((k) => k + 1);
  };

  const handleSort = () => {
    if (parsed === undefined) return;
    setSortOrder((prev) => (prev === 'none' ? 'asc' : prev === 'asc' ? 'desc' : 'none'));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      handleInputChange(text);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Compute search matches
  const matches = useMemo(() => {
    if (!searchTerm || !input) return [];
    const result: { start: number; end: number }[] = [];
    const term = searchTerm.toLowerCase();
    const text = input.toLowerCase();
    let idx = text.indexOf(term);
    while (idx !== -1) {
      result.push({ start: idx, end: idx + searchTerm.length });
      idx = text.indexOf(term, idx + 1);
    }
    return result;
  }, [searchTerm, input]);

  // Reset currentMatchIndex when matches change
  useEffect(() => {
    setCurrentMatchIndex(matches.length > 0 ? 0 : 0);
  }, [matches.length]);

  // Key handling
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      setSearchVisible(true);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  };

  const openOutputSearch = () => {
    prevOutputViewMode.current = outputViewMode;
    setOutputViewMode('text');
    setOutputSearchVisible(true);
    setTimeout(() => outputSearchInputRef.current?.focus(), 0);
  };

  const handleOutputContainerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      openOutputSearch();
    }
  };

  const handleOutputTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      openOutputSearch();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setSearchVisible(false);
      setSearchTerm('');
      setCurrentMatchIndex(0);
      textareaRef.current?.focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0) {
        setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
      }
    }
  };

  const closeSearch = () => {
    setSearchVisible(false);
    setSearchTerm('');
    setCurrentMatchIndex(0);
    textareaRef.current?.focus();
  };

  const handleOutputSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOutputSearchVisible(false);
      setOutputSearchTerm('');
      setOutputCurrentMatchIndex(0);
      setOutputViewMode(prevOutputViewMode.current);
      outputFocusRef.current?.focus?.();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (outputMatches.length > 0) {
        setOutputCurrentMatchIndex((prev) => (prev + 1) % outputMatches.length);
      }
    }
  };

  const closeOutputSearch = () => {
    setOutputSearchVisible(false);
    setOutputSearchTerm('');
    setOutputCurrentMatchIndex(0);
    setOutputViewMode(prevOutputViewMode.current);
    outputFocusRef.current?.focus?.();
  };

  const goToPrevOutputMatch = () => {
    if (outputMatches.length === 0) return;
    setOutputCurrentMatchIndex((prev) => (prev - 1 + outputMatches.length) % outputMatches.length);
  };

  const goToNextOutputMatch = () => {
    if (outputMatches.length === 0) return;
    setOutputCurrentMatchIndex((prev) => (prev + 1) % outputMatches.length);
  };

  const goToPrevMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
  };

  const goToNextMatch = () => {
    if (matches.length === 0) return;
    setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
  };

  // Sync overlay scroll with textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    const overlay = overlayRef.current;
    if (!textarea || !overlay) return;
    const syncScroll = () => {
      overlay.scrollTop = textarea.scrollTop;
      overlay.scrollLeft = textarea.scrollLeft;
    };
    textarea.addEventListener('scroll', syncScroll, { passive: true });
    return () => textarea.removeEventListener('scroll', syncScroll);
  }, [searchVisible]);

  useEffect(() => {
    const textarea = outputTextareaRef.current;
    const overlay = outputOverlayRef.current;
    if (!textarea || !overlay) return;
    const syncScroll = () => {
      overlay.scrollTop = textarea.scrollTop;
      overlay.scrollLeft = textarea.scrollLeft;
    };
    textarea.addEventListener('scroll', syncScroll, { passive: true });
    return () => textarea.removeEventListener('scroll', syncScroll);
  }, [outputSearchVisible]);

  // Scroll textarea to the active match when navigating
  useEffect(() => {
    if (!searchVisible || matches.length === 0) return;
    const textarea = textareaRef.current;
    if (!textarea) return;
    const match = matches[currentMatchIndex];
    if (!match) return;
    // Estimate line number for scrolling
    const textBefore = input.slice(0, match.start);
    const linesBefore = textBefore.split('\n').length - 1;
    const lineHeightRaw = getComputedStyle(textarea).lineHeight;
    const lineHeight = Number.parseFloat(lineHeightRaw) || 20;
    const targetScroll = linesBefore * lineHeight - textarea.clientHeight / 2;
    textarea.scrollTop = Math.max(0, targetScroll);
  }, [currentMatchIndex, matches, searchVisible, input]);

  useEffect(() => {
    if (!outputSearchVisible || outputMatches.length === 0) return;
    const textarea = outputTextareaRef.current;
    if (!textarea) return;
    const match = outputMatches[outputCurrentMatchIndex];
    if (!match) return;
    const textBefore = formattedText.slice(0, match.start);
    const linesBefore = textBefore.split('\n').length - 1;
    const lineHeightRaw = getComputedStyle(textarea).lineHeight;
    const lineHeight = Number.parseFloat(lineHeightRaw) || 20;
    const targetScroll = linesBefore * lineHeight - textarea.clientHeight / 2;
    textarea.scrollTop = Math.max(0, targetScroll);
  }, [outputCurrentMatchIndex, outputMatches, outputSearchVisible, formattedText]);

  // Build highlight overlay content
  const highlightContent = useMemo(() => {
    if (!searchVisible || !searchTerm || matches.length === 0) return null;
    const parts: React.ReactNode[] = [];
    let lastEnd = 0;
    matches.forEach((m, i) => {
      if (m.start > lastEnd) {
        parts.push(input.slice(lastEnd, m.start));
      }
      parts.push(
        <mark key={i} className={i === currentMatchIndex ? styles.highlightMarkActive : styles.highlightMark}>
          {input.slice(m.start, m.end)}
        </mark>,
      );
      lastEnd = m.end;
    });
    if (lastEnd < input.length) {
      parts.push(input.slice(lastEnd));
    }
    return parts;
  }, [searchVisible, searchTerm, matches, currentMatchIndex, input]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.inputPane} style={{ width: `${splitPercent}%` }}>
        <ToolSection
          fill
          bodyVariant="noPad"
          title={mt('inputJson')}
          icon={<VscEdit />}
          actions={
            <ResponsiveActions
              actions={[
                {
                  label: mt('selectFile'),
                  onClick: () => fileInputRef.current?.click(),
                  icon: <VscFolderOpened />,
                },
                { label: mt('clear'), onClick: () => handleInputChange(''), icon: <VscTrash /> },
              ]}
            />
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div className={styles.textareaWrap}>
            {searchVisible && (
              <div className={styles.searchBar}>
                <input
                  ref={searchInputRef}
                  className={styles.searchInput}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder={mt('searchPlaceholder')}
                  spellCheck={false}
                  autoFocus
                />
                <span className={styles.searchInfo}>
                  {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : '0/0'}
                </span>
                <button className={styles.searchBtn} onClick={goToPrevMatch} aria-label={mt('prevMatch')}>
                  <VscChevronUp />
                </button>
                <button className={styles.searchBtn} onClick={goToNextMatch} aria-label={mt('nextMatch')}>
                  <VscChevronDown />
                </button>
                <button className={styles.searchBtn} onClick={closeSearch} aria-label={mt('closeSearch')}>
                  <VscChromeClose />
                </button>
              </div>
            )}
            {searchVisible && (
              <div ref={overlayRef} className={`${styles.highlightOverlay} highlightOverlay`}>
                {highlightContent}
              </div>
            )}
            <textarea
              ref={textareaRef}
              className={`${styles.textarea}${searchVisible ? ` ${styles.textareaTransparent}` : ''}`}
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={mt('placeholder')}
              spellCheck={false}
            />
            <button
              className={`${styles.scrollTopBtn} ${inputScroll.show ? styles.scrollTopVisible : ''}`}
              onClick={inputScroll.scrollToTop}
              aria-label={mt('scrollTop')}
            >
              <VscChevronUp />
            </button>
          </div>
          <div className={styles.statusBar}>
            <span>
              {mt('length')}: {inputStats.length}
            </span>
            <span>
              {mt('spaces')}: {inputStats.spaces}
            </span>
            <span>
              {mt('newlines')}: {inputStats.newlines}
            </span>
          </div>
        </ToolSection>
      </div>

      <div className={styles.divider} onMouseDown={handleMouseDown} />

      <div className={styles.outputPane} style={{ width: `${100 - splitPercent}%` }}>
        <ToolSection
          fill
          bodyVariant="noPad"
          title={mt('result')}
          icon={<VscOutput />}
          actions={
            <ResponsiveActions
              actions={[
                { label: mt('compress'), onClick: handleCompress, icon: <VscArrowDown /> },
                { label: mt('format'), onClick: handleFormat, icon: <VscJson /> },
                { label: copied ? mt('copied') : mt('copy'), onClick: handleCopy, icon: <VscCopy /> },
                { label: mt('download'), onClick: handleDownload, icon: <VscSave /> },
                {
                  label:
                    sortOrder === 'none' ? mt('sort') : sortOrder === 'asc' ? mt('sortAsc') : mt('sortDesc'),
                  onClick: handleSort,
                  icon: <VscSortPrecedence />,
                },
                {
                  label: expandAll ? mt('collapse') : mt('expand'),
                  onClick: handleToggleExpand,
                  icon: expandAll ? <VscCollapseAll /> : <VscExpandAll />,
                },
              ]}
            />
          }
        >
          <div className={styles.outputWrap}>
            <div
              className={styles.outputBody}
              ref={outputFocusRef}
              tabIndex={0}
              onKeyDown={handleOutputContainerKeyDown}
              onMouseDown={() => outputFocusRef.current?.focus?.()}
            >
              {isTextOutput ? (
                <div className={styles.textareaWrap}>
                  {outputSearchVisible && (
                    <div className={styles.searchBar}>
                      <input
                        ref={outputSearchInputRef}
                        className={styles.searchInput}
                        type="text"
                        value={outputSearchTerm}
                        onChange={(e) => setOutputSearchTerm(e.target.value)}
                        onKeyDown={handleOutputSearchKeyDown}
                        placeholder={mt('searchPlaceholder')}
                        spellCheck={false}
                        autoFocus
                      />
                      <span className={styles.searchInfo}>
                        {outputMatches.length > 0
                          ? `${outputCurrentMatchIndex + 1}/${outputMatches.length}`
                          : '0/0'}
                      </span>
                      <button
                        className={styles.searchBtn}
                        onClick={goToPrevOutputMatch}
                        aria-label={mt('prevMatch')}
                      >
                        <VscChevronUp />
                      </button>
                      <button
                        className={styles.searchBtn}
                        onClick={goToNextOutputMatch}
                        aria-label={mt('nextMatch')}
                      >
                        <VscChevronDown />
                      </button>
                      <button
                        className={styles.searchBtn}
                        onClick={closeOutputSearch}
                        aria-label={mt('closeSearch')}
                      >
                        <VscChromeClose />
                      </button>
                    </div>
                  )}
                  {outputSearchVisible && (
                    <div ref={outputOverlayRef} className={`${styles.highlightOverlay} highlightOverlay`}>
                      {outputHighlightContent}
                    </div>
                  )}
                  <textarea
                    ref={outputTextareaRef}
                    className={`${styles.textarea}${outputSearchVisible ? ` ${styles.textareaTransparent}` : ''}`}
                    value={formattedText}
                    readOnly
                    spellCheck={false}
                    onKeyDown={handleOutputTextareaKeyDown}
                  />
                </div>
              ) : (
                <div className={styles.treeWrap} ref={outputTreeRef}>
                  {error ? (
                    <pre className={styles.error}>{error}</pre>
                  ) : displayData !== undefined ? (
                    <JsonTreeView
                      key={treeKey}
                      data={displayData}
                      defaultCollapsedDepth={expandAll ? 999 : 0}
                    />
                  ) : null}
                </div>
              )}
            </div>
            <button
              className={`${styles.scrollTopBtn} ${activeOutputScroll.show ? styles.scrollTopVisible : ''}`}
              onClick={activeOutputScroll.scrollToTop}
              aria-label={mt('scrollTop')}
            >
              <VscChevronUp />
            </button>
          </div>
          <div className={styles.statusBar}>
            <span>
              {mt('length')}: {outputStats.length}
            </span>
            <span>
              {mt('spaces')}: {outputStats.spaces}
            </span>
            <span>
              {mt('newlines')}: {outputStats.newlines}
            </span>
          </div>
        </ToolSection>
      </div>
    </div>
  );
}
