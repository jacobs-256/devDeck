// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './JsonYamlConverter.module.css';
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
import yamlParser from 'js-yaml';

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

function isScalar(v: JsonValue): v is null | boolean | number | string {
  return v === null || typeof v === 'boolean' || typeof v === 'number' || typeof v === 'string';
}

function textStats(text: string) {
  const length = text.length;
  const spaces = (text.match(/ /g) || []).length;
  const lines = text ? (text.match(/\n/g) || []).length + 1 : 0;
  return { length, spaces, lines };
}

function yamlScalar(v: null | boolean | number | string): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null';
  const s = String(v);
  if (s === '') return '""';
  if (/^[A-Za-z0-9_./-]+$/.test(s) && !/^(true|false|null|~|yes|no|on|off)$/i.test(s)) return s;
  return JSON.stringify(s);
}

function yamlKey(k: string): string {
  const key = String(k);
  if (/^[A-Za-z0-9_-]+$/.test(key)) return key;
  return JSON.stringify(key);
}

function toYaml(value: JsonValue, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (isScalar(value)) return `${pad}${yamlScalar(value)}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value
      .map((item) => {
        if (isScalar(item)) return `${pad}- ${yamlScalar(item)}`;
        const head = `${pad}-`;
        const body = toYaml(item, indent + 2);
        return `${head}\n${body}`;
      })
      .join('\n');
  }
  const obj = value as Record<string, JsonValue>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return `${pad}{}`;
  return keys
    .map((k) => {
      const v = obj[k];
      const kk = yamlKey(k);
      if (v === undefined) return `${pad}${kk}: null`;
      if (isScalar(v)) return `${pad}${kk}: ${yamlScalar(v)}`;
      return `${pad}${kk}:\n${toYaml(v, indent + 2)}`;
    })
    .join('\n');
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

export default function JsonYamlConverter() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'JsonYamlConverter');
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

  const [mode, setMode] = useState<'jsonToYaml' | 'yamlToJson'>('jsonToYaml');
  const [jsonInput, setJsonInput] = useState('');
  const [yamlInput, setYamlInput] = useState('');
  const [outputText, setOutputText] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const yamlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const yamlHighlightRef = useRef<HTMLPreElement>(null);

  const { splitPercent, containerRef, handleMouseDown } = useSplitPane(50);

  const handleImport = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) {
      fileInputRef.current?.click();
      return;
    }
    const result = await api.openFile(
      mode === 'jsonToYaml'
        ? [
            { name: 'JSON', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] },
          ]
        : [
            { name: 'YAML', extensions: ['yml', 'yaml'] },
            { name: 'All Files', extensions: ['*'] },
          ],
    );
    if (!result) return;
    const content = String(result.content ?? '');
    if (mode === 'jsonToYaml') setJsonInput(content);
    else setYamlInput(content);
  }, [mode]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');
      if (mode === 'jsonToYaml') setJsonInput(content);
      else setYamlInput(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleFormat = useCallback(() => {
    if (mode !== 'jsonToYaml') return;
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
    if (mode !== 'jsonToYaml') {
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
          if (!update.docChanged) return;
          setJsonInput(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: editorHostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
    const raw = (mode === 'jsonToYaml' ? jsonInput : yamlInput).trim();
    if (!raw) {
      setOutputText('');
      setError('');
      return;
    }
    if (mode === 'jsonToYaml') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        const normalized = normalizeJsonValue(parsed);
        const out = toYaml(normalized, 0);
        setOutputText(out.endsWith('\n') ? out : `${out}\n`);
        setError('');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setOutputText('');
        setError(`${mt('errorInvalidJson')}: ${msg}`);
      }
      return;
    }
    try {
      const parsed = yamlParser.load(raw);
      const normalized = normalizeJsonValue(parsed);
      setOutputText(`${JSON.stringify(normalized, null, 2)}\n`);
      setError('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOutputText('');
      setError(`${mt('errorInvalidYaml')}: ${msg}`);
    }
  }, [jsonInput, mode, mt, yamlInput]);

  const highlightedOutput = useMemo(() => {
    if (!outputText) return '';
    try {
      return hljs.highlight(outputText, { language: mode === 'jsonToYaml' ? 'yaml' : 'json' }).value;
    } catch {
      return hljs.highlightAuto(outputText).value;
    }
  }, [mode, outputText]);

  const highlightedYamlInput = useMemo(() => {
    if (!yamlInput) return '';
    try {
      return hljs.highlight(yamlInput, { language: 'yaml' }).value;
    } catch {
      return hljs.highlightAuto(yamlInput).value;
    }
  }, [yamlInput]);

  const handleYamlScroll = () => {
    const ta = yamlTextareaRef.current;
    const pre = yamlHighlightRef.current;
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
    const isYaml = mode === 'jsonToYaml';
    const blob = new Blob([outputText], { type: isYaml ? 'text/yaml' : 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isYaml ? 'converted.yaml' : 'converted.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [mode, outputText]);

  const handleClear = useCallback(() => {
    if (mode === 'jsonToYaml') setJsonInput('');
    else setYamlInput('');
    setOutputText('');
    setCopied(false);
    setError('');
  }, [mode]);

  const inputTitle = mode === 'jsonToYaml' ? mt('inputJson') : mt('inputYaml');
  const outputTitle = mode === 'jsonToYaml' ? mt('outputYaml') : mt('outputJson');
  const importLabel = mode === 'jsonToYaml' ? mt('importJson') : mt('importYaml');
  const acceptAttr =
    mode === 'jsonToYaml' ? '.json,application/json' : '.yml,.yaml,text/yaml,application/x-yaml';
  const inputText = mode === 'jsonToYaml' ? jsonInput : yamlInput;
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
              onChange={(e) => setMode(e.target.value as 'jsonToYaml' | 'yamlToJson')}
            >
              <option value="jsonToYaml">{mt('modeJsonToYaml')}</option>
              <option value="yamlToJson">{mt('modeYamlToJson')}</option>
            </select>
            <span className={styles.paneTitle}>{inputTitle}</span>
          </div>
          <ResponsiveActions
            actions={[
              { label: importLabel, onClick: () => void handleImport(), icon: <VscFolderOpened /> },
              ...(mode === 'jsonToYaml'
                ? [{ label: mt('formatJson'), onClick: handleFormat, icon: <VscWand /> }]
                : []),
              { label: mt('clear'), onClick: handleClear },
            ]}
            compactWidth={420}
          />
        </div>
        <div className={styles.body}>
          {mode === 'jsonToYaml' ? (
            <div key="json" ref={editorHostRef} className={styles.editor} />
          ) : (
            <div key="yaml" className={styles.yamlWrap}>
              <pre ref={yamlHighlightRef} className={styles.yamlHighlight} aria-hidden>
                <code dangerouslySetInnerHTML={{ __html: highlightedYamlInput || ' ' }} />
              </pre>
              <textarea
                ref={yamlTextareaRef}
                className={styles.yamlTextarea}
                value={yamlInput}
                placeholder={mt('placeholderYaml')}
                onChange={(e) => setYamlInput(e.target.value)}
                onScroll={handleYamlScroll}
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
                {mode === 'jsonToYaml' ? mt('placeholderYaml') : mt('placeholderJson')}
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
