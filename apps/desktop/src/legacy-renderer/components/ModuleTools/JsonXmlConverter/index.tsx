// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './JsonXmlConverter.module.css';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { json } from '@codemirror/lang-json';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { search, searchKeymap } from '@codemirror/search';
import { bracketMatching } from '@codemirror/language';
import { useSplitPane } from '@@components';
import ResponsiveActions from '../../ResponsiveActions';
import { useI18n, getModuleLocale } from '../../../i18n';
import { useTheme } from '../../../theme';
import hljs from 'highlight.js';
import { VscFolderOpened, VscWand } from 'react-icons/vsc';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | {
      [k: string]: JsonValue;
    };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function textStats(text: string) {
  const length = text.length;
  const spaces = (text.match(/ /g) || []).length;
  const lines = text ? (text.match(/\n/g) || []).length + 1 : 0;
  return { length, spaces, lines };
}

function normalizeJsonValue(input: unknown): JsonValue {
  if (input === null) return null;
  if (typeof input === 'string') return input;
  if (typeof input === 'boolean') return input;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (Array.isArray(input)) return input.map((x) => normalizeJsonValue(x));
  if (isPlainObject(input)) {
    const out: Record<string, JsonValue> = {};
    Object.keys(input).forEach((k) => {
      out[k] = normalizeJsonValue(input[k]);
    });
    return out;
  }
  return String(input);
}

function jsonToXmlString(json: unknown): string {
  const normalized = normalizeJsonValue(json);
  const rootName = 'root';
  const rootValue = Array.isArray(normalized) ? { item: normalized } : normalized;
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
  });
  return `${builder.build({ [rootName]: rootValue })}\n`;
}

export default function JsonXmlConverter() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'JsonXmlConverter');
  const mt = useCallback((key: string) => localeData?.[key] ?? key, [localeData]);
  const { theme } = useTheme();
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

  const [mode, setMode] = useState<'jsonToXml' | 'xmlToJson'>('jsonToXml');
  const [jsonInput, setJsonInput] = useState('');
  const [xmlInput, setXmlInput] = useState('');
  const [outputText, setOutputText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xmlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const xmlHighlightRef = useRef<HTMLPreElement>(null);

  const { splitPercent, containerRef, handleMouseDown } = useSplitPane(50);

  const handleImport = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) {
      fileInputRef.current?.click();
      return;
    }
    const result = await api.openFile(
      mode === 'jsonToXml'
        ? [
            { name: 'JSON', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ]
        : [
            { name: 'XML', extensions: ['xml'] },
            { name: 'All Files', extensions: ['*'] },
          ],
    );
    if (!result) return;
    const content = String(result.content ?? '');
    if (mode === 'jsonToXml') setJsonInput(content);
    else setXmlInput(content);
  }, [mode]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      if (mode === 'jsonToXml') setJsonInput(content);
      else setXmlInput(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFormat = useCallback(() => {
    if (mode !== 'jsonToXml') return;
    const raw = jsonInput.trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      setJsonInput(`${JSON.stringify(parsed, null, 2)}\n`);
      setError('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`${mt('errorInvalidJson')}: ${msg}`);
    }
  }, [jsonInput, mode, mt]);

  useEffect(() => {
    if (mode !== 'jsonToXml') {
      const view = viewRef.current;
      if (view) {
        view.destroy();
        viewRef.current = null;
      }
      return;
    }
    if (!editorHostRef.current) return;
    if (viewRef.current) return;
    const state = EditorState.create({
      doc: jsonInput,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        search(),
        json(),
        themeCompartment.of(cmTheme),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) setJsonInput(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorHostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [cmTheme, jsonInput, mode, themeCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: themeCompartment.reconfigure(cmTheme) });
  }, [cmTheme, themeCompartment]);

  const lastJsonRef = useRef(jsonInput);
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (jsonInput !== current && jsonInput !== lastJsonRef.current) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: jsonInput } });
    }
    lastJsonRef.current = jsonInput;
  }, [jsonInput]);

  useEffect(() => {
    const raw = (mode === 'jsonToXml' ? jsonInput : xmlInput).trim();
    if (!raw) {
      setOutputText('');
      setError('');
      return;
    }
    if (mode === 'jsonToXml') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        setOutputText(jsonToXmlString(parsed));
        setError('');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setOutputText('');
        setError(`${mt('errorInvalidJson')}: ${msg}`);
      }
      return;
    }
    try {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
      const parsed = parser.parse(raw);
      const normalized = normalizeJsonValue(parsed);
      setOutputText(`${JSON.stringify(normalized, null, 2)}\n`);
      setError('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOutputText('');
      setError(`${mt('errorInvalidXml')}: ${msg}`);
    }
  }, [jsonInput, mode, mt, xmlInput]);

  const highlightedOutput = useMemo(() => {
    if (!outputText) return '';
    try {
      return hljs.highlight(outputText, { language: mode === 'jsonToXml' ? 'xml' : 'json' }).value;
    } catch {
      return hljs.highlightAuto(outputText).value;
    }
  }, [mode, outputText]);

  const highlightedXmlInput = useMemo(() => {
    if (!xmlInput) return '';
    try {
      return hljs.highlight(xmlInput, { language: 'xml' }).value;
    } catch {
      return hljs.highlightAuto(xmlInput).value;
    }
  }, [xmlInput]);

  const handleXmlScroll = () => {
    const ta = xmlTextareaRef.current;
    const pre = xmlHighlightRef.current;
    if (!ta || !pre) return;
    pre.scrollTop = ta.scrollTop;
    pre.scrollLeft = ta.scrollLeft;
  };

  const handleCopy = useCallback(async () => {
    if (!outputText) return;
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [outputText]);

  const handleDownload = useCallback(() => {
    if (!outputText) return;
    const isXml = mode === 'jsonToXml';
    const blob = new Blob([outputText], { type: isXml ? 'application/xml' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isXml ? 'converted.xml' : 'converted.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [mode, outputText]);

  const handleClear = useCallback(() => {
    if (mode === 'jsonToXml') setJsonInput('');
    else setXmlInput('');
    setOutputText('');
    setCopied(false);
    setError('');
  }, [mode]);

  const inputTitle = mode === 'jsonToXml' ? mt('inputJson') : mt('inputXml');
  const outputTitle = mode === 'jsonToXml' ? mt('outputXml') : mt('outputJson');
  const importLabel = mode === 'jsonToXml' ? mt('importJson') : mt('importXml');
  const acceptAttr = mode === 'jsonToXml' ? '.json,application/json' : '.xml,application/xml,text/xml';
  const inputText = mode === 'jsonToXml' ? jsonInput : xmlInput;
  const inputStats = useMemo(() => textStats(inputText), [inputText]);
  const outputStats = useMemo(() => textStats(outputText), [outputText]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.inputPane} style={{ width: `${splitPercent}%` }}>
        <div className={styles.paneHeader}>
          <div className={styles.modeWrap}>
            <span className={styles.modeLabel}>{mt('mode')}</span>
            <select
              className={styles.modeSelect}
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="jsonToXml">{mt('modeJsonToXml')}</option>
              <option value="xmlToJson">{mt('modeXmlToJson')}</option>
            </select>
            <span className={styles.paneTitle}>{inputTitle}</span>
          </div>
          <ResponsiveActions
            actions={[
              { label: importLabel, onClick: () => void handleImport(), icon: <VscFolderOpened /> },
              ...(mode === 'jsonToXml'
                ? [{ label: mt('formatJson'), onClick: handleFormat, icon: <VscWand /> }]
                : []),
              { label: mt('clear'), onClick: handleClear },
            ]}
            compactWidth={420}
          />
        </div>
        <div className={styles.body}>
          {mode === 'jsonToXml' ? (
            <div key="json" ref={editorHostRef} className={styles.editor} />
          ) : (
            <div key="xml" className={styles.xmlWrap}>
              <pre ref={xmlHighlightRef} className={styles.xmlHighlight} aria-hidden>
                <code dangerouslySetInnerHTML={{ __html: highlightedXmlInput || ' ' }} />
              </pre>
              <textarea
                ref={xmlTextareaRef}
                className={styles.xmlTextarea}
                value={xmlInput}
                placeholder={mt('placeholderXml')}
                onChange={(e) => setXmlInput(e.target.value)}
                onScroll={handleXmlScroll}
                spellCheck={false}
              />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
        <div className={styles.statusBar}>
          <span>Length: {inputStats.length}</span>
          <span>Spaces: {inputStats.spaces}</span>
          <span>Lines: {inputStats.lines}</span>
        </div>
      </div>

      <div className={styles.divider} onMouseDown={handleMouseDown} />

      <div className={styles.outputPane} style={{ width: `${100 - splitPercent}%` }}>
        <div className={styles.paneHeader}>
          <span className={styles.paneTitle}>{outputTitle}</span>
          <ResponsiveActions
            actions={[
              { label: copied ? mt('copied') : mt('copy'), onClick: handleCopy, disabled: !outputText },
              { label: mt('save'), onClick: handleDownload, disabled: !outputText },
            ]}
            compactWidth={420}
          />
        </div>
        <div className={styles.body}>
          <div className={styles.outputWrap}>
            {outputText ? (
              <pre className={styles.outputPre}>
                <code dangerouslySetInnerHTML={{ __html: highlightedOutput }} />
              </pre>
            ) : (
              <pre className={styles.outputPre}>
                {mode === 'jsonToXml' ? mt('placeholderXml') : mt('placeholderJson')}
              </pre>
            )}
          </div>
        </div>
        <div className={styles.statusBar}>
          <span>Length: {outputStats.length}</span>
          <span>Spaces: {outputStats.spaces}</span>
          <span>Lines: {outputStats.lines}</span>
        </div>
        {error ? <div className={styles.errorBar}>{error}</div> : null}
      </div>
    </div>
  );
}
