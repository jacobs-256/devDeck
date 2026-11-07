// @ts-nocheck
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import styles from './MarkdownPreview.module.css';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { marked } from 'marked';
import hljs from 'highlight.js';
import ResponsiveActions from '../../ResponsiveActions';
import { useI18n, getModuleLocale } from '../../../i18n';
import { useTheme } from '../../../theme';
import { ToolSection } from '@@components';
import {
  VscChevronUp,
  VscFolderOpened,
  VscMarkdown,
  VscPreview,
  VscSave,
  VscSaveAs,
  VscTrash,
} from 'react-icons/vsc';

const DEFAULT_MD = `# Markdown Preview

Edit Markdown on the left, live preview on the right.

## Features

- Open **.md** files
- Manual editing
- Save and Save As
- Code highlighting

\`\`\`js
console.log('Hello, Markdown!');
\`\`\`

> Blockquote example

| Col1 | Col2 |
|------|------|
| A    | B    |
`;

// Configure marked with highlight.js
marked.setOptions({
  breaks: true,
  gfm: true,
});

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
  const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
  const highlighted = hljs.highlight(text, { language }).value;
  return `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`;
};

export default function MarkdownPreview() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'MarkdownPreview');
  const mt = useCallback((key: string) => localeData?.[key] ?? key, [localeData]);
  const { theme } = useTheme();
  const [previewPalette, setPreviewPalette] = useState(() => ({
    bg: '#0d1117',
    text: '#e6edf3',
    border: '#30363d',
    muted: '#8b949e',
    codeBg: '#161b22',
    link: '#58a6ff',
  }));
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

  const [input, setInput] = useState(DEFAULT_MD);
  const [sourceFilePath, setSourceFilePath] = useState<string | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: input,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        markdown({ codeLanguages: languages }),
        themeCompartment.of(cmTheme),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setInput(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
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

  // Sync external changes into CodeMirror
  const lastInputRef = useRef(input);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (input !== cur && input !== lastInputRef.current) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: input } });
    }
    lastInputRef.current = input;
  }, [input]);

  // Drag to resize
  const handleMouseDown = () => {
    dragging.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(80, Math.max(20, pct)));
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
    const root = document.documentElement;
    const s = window.getComputedStyle(root);
    const get = (key: string, fallback: string) => {
      const v = s.getPropertyValue(key).trim();
      return v || fallback;
    };
    setPreviewPalette({
      bg: get('--bg-secondary', theme === 'dark' ? '#0d1117' : '#ffffff'),
      text: get('--text-primary', theme === 'dark' ? '#e6edf3' : '#24292f'),
      border: get('--border-default', theme === 'dark' ? '#30363d' : '#d0d7de'),
      muted: get('--text-secondary', theme === 'dark' ? '#8b949e' : '#57606a'),
      codeBg: get('--bg-elevated', theme === 'dark' ? '#161b22' : '#f6f8fa'),
      link: get('--accent-primary', theme === 'dark' ? '#58a6ff' : '#0969da'),
    });
  }, [theme]);

  const previewHtml = useMemo(() => {
    const body = marked.parse(input, { renderer }) as string;
    const hljsTheme =
      theme === 'dark'
        ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
        : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<link rel="stylesheet" href="${hljsTheme}">
<style>
body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; padding: 16px 24px; color: ${previewPalette.text}; background: ${previewPalette.bg}; line-height: 1.6; }
h1,h2,h3,h4,h5,h6 { border-bottom: 1px solid ${previewPalette.border}; padding-bottom: 0.3em; margin-top: 1.5em; }
a { color: ${previewPalette.link}; }
code { background: ${previewPalette.codeBg}; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
pre { background: ${previewPalette.codeBg}; padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid ${previewPalette.border}; margin: 0; padding: 0 16px; color: ${previewPalette.muted}; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid ${previewPalette.border}; padding: 6px 12px; }
th { background: ${previewPalette.codeBg}; }
img { max-width: 100%; }
hr { border: none; border-top: 1px solid ${previewPalette.border}; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(128,128,128,0.6); }
</style></head><body>${body}</body></html>`;
  }, [input, previewPalette, theme]);

  const inputStats = useMemo(
    () => ({
      length: input.length,
      lines: (input.match(/\n/g) || []).length + 1,
    }),
    [input],
  );

  const mdFilters = useMemo(
    () => [
      { name: mt('mdFiles'), extensions: ['md', 'markdown', 'txt'] },
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
    const result = await api.openFile(mdFilters);
    if (result) {
      setSourceFilePath(result.filePath);
      setInput(result.content);
    }
  }, [mdFilters]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSourceFilePath(null);
    const reader = new FileReader();
    reader.onload = () => setInput(reader.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownload = useCallback(() => {
    if (!input) return;
    const blob = new Blob([input], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [input]);

  const handleSave = useCallback(async () => {
    if (!input) return;
    const api = window.electronAPI;
    if (!api) {
      handleDownload();
      return;
    }
    if (sourceFilePath) {
      const confirmed = await api.confirmOverwrite(sourceFilePath);
      if (confirmed) await api.saveFile(sourceFilePath, input);
    } else {
      const saved = await api.saveFileAs('document.md', input, mdFilters);
      if (saved) setSourceFilePath(saved);
    }
  }, [input, sourceFilePath, handleDownload, mdFilters]);

  const handleSaveAs = useCallback(async () => {
    if (!input) return;
    const api = window.electronAPI;
    if (!api) {
      handleDownload();
      return;
    }
    const saved = await api.saveFileAs('document.md', input, mdFilters);
    if (saved) setSourceFilePath(saved);
  }, [input, handleDownload, mdFilters]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.editorPane} style={{ width: `${splitPercent}%` }}>
        <ToolSection
          fill
          bodyVariant="noPad"
          title={mt('mdEdit')}
          icon={<VscMarkdown />}
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
                {
                  label: mt('clear'),
                  onClick: () => {
                    setInput('');
                    setSourceFilePath(null);
                  },
                  icon: <VscTrash />,
                },
              ]}
            />
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt"
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

      <div className={styles.previewPane} style={{ width: `${100 - splitPercent}%` }}>
        <ToolSection fill bodyVariant="noPad" title={mt('livePreview')} icon={<VscPreview />}>
          <div className={styles.previewBody}>
            {isDragging && <div className={styles.dragOverlay} />}
            <iframe title="Markdown Preview" srcDoc={previewHtml} sandbox="allow-scripts" />
          </div>
        </ToolSection>
      </div>
    </div>
  );
}
