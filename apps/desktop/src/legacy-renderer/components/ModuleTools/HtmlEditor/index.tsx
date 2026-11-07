// @ts-nocheck
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import styles from './HtmlEditor.module.css';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { html } from '@codemirror/lang-html';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import ResponsiveActions from '../../ResponsiveActions';
import { useI18n, getModuleLocale } from '../../../i18n';
import { useTheme } from '../../../theme';
import {
  VscArrowDown,
  VscChevronUp,
  VscCloudDownload,
  VscCode,
  VscCopy,
  VscFolderOpened,
  VscOpenPreview,
  VscSave,
  VscSaveAs,
  VscTrash,
  VscWand,
} from 'react-icons/vsc';
import { ToolSection } from '@@components';

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: sans-serif; padding: 20px; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>Hello World</h1>
  <p>Edit HTML on the left, live preview on the right.</p>
</body>
</html>`;

const SCROLLBAR_CSS = `<style>
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.6); }
</style>`;

export default function HtmlEditor() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'HtmlEditor');
  const mt = useCallback((key: string) => localeData?.[key] ?? key, [localeData]);
  const { theme } = useTheme();

  const [input, setInput] = useState(DEFAULT_HTML);
  const [copied, setCopied] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [sourceFilePath, setSourceFilePath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dragging = useRef(false);

  const [showScrollTop, setShowScrollTop] = useState(false);
  const didInitSplitRef = useRef(false);

  const PREVIEW_DEFAULT_PX = 520;
  const PANE_MIN_PX = 360;
  const DIVIDER_PX = 8;
  const themeCompartment = useMemo(() => new Compartment(), []);

  const cmTheme = useMemo(
    () =>
      EditorView.theme(
        {
          '&': {
            height: '100%',
            fontSize: 'var(--font-size-base)',
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
          },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-family-mono)' },
          '.cm-content': { minHeight: '100%' },
          '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-quaternary)', border: 'none' },
          '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--accent-primary) 8%, transparent)' },
          '.cm-activeLineGutter': {
            backgroundColor: 'color-mix(in oklab, var(--accent-primary) 12%, transparent)',
          },
          '.cm-selectionBackground': {
            backgroundColor: 'color-mix(in oklab, var(--accent-primary) 28%, transparent) !important',
          },
          '.cm-cursor': { borderLeftColor: 'var(--text-primary)' },
        },
        { dark: theme === 'dark' },
      ),
    [theme],
  );

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: input,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        search(),
        html(),
        themeCompartment.of(cmTheme),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setInput(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;

    // Listen to scroller for scroll-to-top button
    const scroller = view.scrollDOM;
    const onScroll = () => setShowScrollTop(scroller.scrollTop > 100);
    scroller.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(cmTheme) });
  }, [cmTheme, themeCompartment]);

  const handleEditorScrollTop = () => {
    viewRef.current?.scrollDOM.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sync external changes (file load, clear) into CodeMirror
  const lastInputRef = useRef(input);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (input !== currentDoc && input !== lastInputRef.current) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: input },
      });
    }
    lastInputRef.current = input;
  }, [input]);

  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = () => {
    dragging.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rawPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const minPercent = (PANE_MIN_PX / rect.width) * 100;
      const maxPercent = 100 - minPercent;
      const percent = Math.min(maxPercent, Math.max(minPercent, rawPercent));
      setSplitPercent(percent);
    };

    const onMouseUp = () => {
      dragging.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    if (didInitSplitRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const preview = Math.min(PREVIEW_DEFAULT_PX, Math.max(PANE_MIN_PX, rect.width * 0.45));
    const editorPx = Math.max(PANE_MIN_PX, rect.width - preview - DIVIDER_PX);
    const percent = (editorPx / rect.width) * 100;
    const minPercent = (PANE_MIN_PX / rect.width) * 100;
    const maxPercent = 100 - minPercent;
    setSplitPercent(Math.min(maxPercent, Math.max(minPercent, percent)));
    didInitSplitRef.current = true;
  }, []);

  const previewHtml = useMemo(() => {
    let html = input;
    if (!html.toLowerCase().includes('<meta') || !html.toLowerCase().includes('charset')) {
      html = html.replace(/(<head[^>]*>)/i, '$1\n<meta charset="UTF-8">');
    }
    // Inject scrollbar styles before </head>
    if (html.toLowerCase().includes('</head>')) {
      html = html.replace(/<\/head>/i, `${SCROLLBAR_CSS}\n</head>`);
    } else {
      html = SCROLLBAR_CSS + html;
    }
    return html;
  }, [input]);

  const inputStats = useMemo(
    () => ({
      length: input.length,
      lines: (input.match(/\n/g) || []).length + 1,
    }),
    [input],
  );

  const handleCopy = useCallback(async () => {
    if (!input) return;
    await navigator.clipboard.writeText(input);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [input]);

  const handleDownload = useCallback(() => {
    if (!input) return;
    const blob = new Blob([input], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'page.html';
    a.click();
    URL.revokeObjectURL(url);
  }, [input]);

  const htmlFilters = useMemo(
    () => [
      { name: mt('htmlFiles'), extensions: ['html', 'htm'] },
      { name: mt('allFiles'), extensions: ['*'] },
    ],
    [mt],
  );

  const handleOpen = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) {
      fileInputRef.current?.click();
      return;
    }
    const result = await api.openFile(htmlFilters);
    if (result) {
      setSourceFilePath(result.filePath);
      setInput(result.content);
    }
  }, [htmlFilters]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceFilePath(null);
    const reader = new FileReader();
    reader.onload = () => setInput(reader.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCompress = () => {
    if (!input) return;
    const compressed = input
      .replace(/\n\s*/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
    setInput(compressed);
  };

  const handleBeautify = () => {
    if (!input) return;
    // Simple HTML beautifier
    let result = '';
    let indent = 0;
    const tab = '  ';
    // Normalize: remove existing formatting
    const raw = input.replace(/>\s+</g, '><').trim();
    // Split into tags and text
    const tokens = raw.match(/(<[^>]+>|[^<]+)/g) || [];
    const voidTags = new Set([
      'area',
      'base',
      'br',
      'col',
      'embed',
      'hr',
      'img',
      'input',
      'link',
      'meta',
      'param',
      'source',
      'track',
      'wbr',
    ]);

    for (const token of tokens) {
      if (token.startsWith('</')) {
        // Closing tag
        indent = Math.max(0, indent - 1);
        result += tab.repeat(indent) + token + '\n';
      } else if (token.startsWith('<')) {
        const tagMatch = token.match(/^<([a-zA-Z][a-zA-Z0-9]*)/);
        const tagName = tagMatch ? tagMatch[1].toLowerCase() : '';
        const selfClosing = token.endsWith('/>') || voidTags.has(tagName);
        const isDoctype = token.startsWith('<!');
        result += tab.repeat(indent) + token + '\n';
        if (!selfClosing && !isDoctype && tagName) {
          indent++;
        }
      } else {
        // Text content
        const trimmed = token.trim();
        if (trimmed) {
          result += tab.repeat(indent) + trimmed + '\n';
        }
      }
    }
    setInput(result.trimEnd());
  };

  const handleSave = useCallback(async () => {
    if (!input) return;
    const api = window.electronAPI;
    if (!api) {
      handleDownload();
      return;
    }
    if (sourceFilePath) {
      const confirmed = await api.confirmOverwrite(sourceFilePath);
      if (confirmed) {
        await api.saveFile(sourceFilePath, input);
      }
    } else {
      const saved = await api.saveFileAs('page.html', input, htmlFilters);
      if (saved) setSourceFilePath(saved);
    }
  }, [input, sourceFilePath, handleDownload, htmlFilters]);

  const handleSaveAs = useCallback(async () => {
    if (!input) return;
    const api = window.electronAPI;
    if (!api) {
      handleDownload();
      return;
    }
    const saved = await api.saveFileAs('page.html', input, htmlFilters);
    if (saved) setSourceFilePath(saved);
  }, [input, handleDownload, htmlFilters]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.editorPane} style={{ width: `${splitPercent}%`, minWidth: PANE_MIN_PX }}>
        <ToolSection
          fill
          bodyVariant="noPad"
          title={mt('htmlEdit')}
          icon={<VscCode />}
          actions={
            <ResponsiveActions
              actions={[
                { label: mt('open'), onClick: handleOpen, icon: <VscFolderOpened /> },
                {
                  label: mt('save'),
                  onClick: handleSave,
                  icon: <VscSave />,
                  subActions: [{ label: mt('saveAs'), onClick: handleSaveAs, icon: <VscSaveAs /> }],
                },
                { label: mt('compress'), onClick: handleCompress, icon: <VscArrowDown /> },
                { label: mt('beautify'), onClick: handleBeautify, icon: <VscWand /> },
                { label: copied ? mt('copied') : mt('copy'), onClick: handleCopy, icon: <VscCopy /> },
                { label: mt('download'), onClick: handleDownload, icon: <VscCloudDownload /> },
                { label: mt('clear'), onClick: () => setInput(''), icon: <VscTrash /> },
              ]}
            />
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,.htm,.txt"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <div className={styles.editorBodyWrap}>
            <div className={styles.editorBody} ref={editorRef} />
            <button
              className={`${styles.scrollTopBtn} ${showScrollTop ? styles.scrollTopVisible : ''}`}
              onClick={handleEditorScrollTop}
              aria-label={mt('scrollTop')}
            >
              <VscChevronUp />
            </button>
          </div>
          <div className={styles.statusBar}>
            <span>
              {mt('chars')}: {inputStats.length}
            </span>
            <span>
              {mt('lines')}: {inputStats.lines}
            </span>
          </div>
        </ToolSection>
      </div>

      <div className={styles.divider} onMouseDown={handleMouseDown} />

      <div
        className={styles.previewPane}
        style={{
          width: `${100 - splitPercent}%`,
          minWidth: PANE_MIN_PX,
        }}
      >
        <ToolSection fill bodyVariant="noPad" title={mt('livePreview')} icon={<VscOpenPreview />}>
          <div className={styles.previewBody}>
            {isDragging && <div className={styles.dragOverlay} />}
            <iframe title={mt('htmlPreview')} srcDoc={previewHtml} sandbox="allow-scripts" />
          </div>
        </ToolSection>
      </div>
    </div>
  );
}
