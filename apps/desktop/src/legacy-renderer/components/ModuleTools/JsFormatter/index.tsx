// @ts-nocheck
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import styles from './JsFormatter.module.css';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import ResponsiveActions from '../../ResponsiveActions';
import { useI18n, getModuleLocale } from '../../../i18n';
import { useTheme } from '../../../theme';
import {
  VscArrowDown,
  VscChevronUp,
  VscCode,
  VscCopy,
  VscLock,
  VscOutput,
  VscPlay,
  VscRocket,
  VscTrash,
  VscWand,
} from 'react-icons/vsc';
import { ToolSection } from '@@components';

const DEFAULT_JS = `function greet(name) {
  const message = "Hello, " + name + "!";
  console.log(message);
  return message;
}

greet("World");`;

export default function JsFormatter() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'JsFormatter');
  const mt = (key: string) => localeData?.[key] ?? key;
  const { theme } = useTheme();

  const inputThemeCompartment = useMemo(() => new Compartment(), []);
  const outputThemeCompartment = useMemo(() => new Compartment(), []);
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

  const [input, setInput] = useState(DEFAULT_JS);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const [copied, setCopied] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const outputEditorRef = useRef<HTMLDivElement>(null);
  const outputViewRef = useRef<EditorView | null>(null);
  const dragging = useRef(false);

  const [showInputScrollTop, setShowInputScrollTop] = useState(false);
  const [showOutputScrollTop, setShowOutputScrollTop] = useState(false);

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorRef.current) return;
    const state = EditorState.create({
      doc: input,
      extensions: [
        lineNumbers(),
        history(),
        bracketMatching(),
        javascript(),
        inputThemeCompartment.of(cmTheme),
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
    const onScroll = () => setShowInputScrollTop(scroller.scrollTop > 100);
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
    view.dispatch({ effects: inputThemeCompartment.reconfigure(cmTheme) });
  }, [cmTheme, inputThemeCompartment]);

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

  // Output CodeMirror (read-only, for highlighted output)
  useEffect(() => {
    // Destroy previous output editor
    if (outputViewRef.current) {
      outputViewRef.current.destroy();
      outputViewRef.current = null;
    }
    if (!highlight || !output || !outputEditorRef.current) return;

    const state = EditorState.create({
      doc: output,
      extensions: [
        lineNumbers(),
        bracketMatching(),
        javascript(),
        outputThemeCompartment.of(cmTheme),
        syntaxHighlighting(defaultHighlightStyle),
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
      ],
    });
    const view = new EditorView({ state, parent: outputEditorRef.current });
    outputViewRef.current = view;

    const scroller = view.scrollDOM;
    const onScroll = () => setShowOutputScrollTop(scroller.scrollTop > 100);
    scroller.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      view.destroy();
      outputViewRef.current = null;
    };
  }, [cmTheme, highlight, output, outputThemeCompartment]);

  useEffect(() => {
    const view = outputViewRef.current;
    if (!view) return;
    view.dispatch({ effects: outputThemeCompartment.reconfigure(cmTheme) });
  }, [cmTheme, outputThemeCompartment]);

  const inputStats = useMemo(
    () => ({
      length: input.length,
      lines: (input.match(/\n/g) || []).length + 1,
    }),
    [input],
  );

  const outputStats = useMemo(
    () => ({
      length: output.length,
      lines: output ? (output.match(/\n/g) || []).length + 1 : 0,
    }),
    [output],
  );

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

  const runAsync = useCallback(
    async (fn: () => Promise<string>, highlighted = false) => {
      if (!input.trim()) return;
      setProcessing(true);
      setError('');
      setHighlight(highlighted);
      try {
        const result = await fn();
        setOutput(result);
      } catch (e) {
        setError((e as Error).message);
        setOutput('');
      } finally {
        setProcessing(false);
      }
    },
    [input],
  );

  const handleBeautify = () =>
    runAsync(async () => {
      const prettier = await import('prettier/standalone');
      const parserBabel = await import('prettier/plugins/babel');
      const estree = await import('prettier/plugins/estree');
      const result = await prettier.format(input, {
        parser: 'babel',
        plugins: [parserBabel.default, estree.default],
        semi: true,
        singleQuote: false,
        tabWidth: 2,
      });
      return result;
    }, true);

  const handleMinify = () =>
    runAsync(async () => {
      const { minify } = await import('terser');
      const result = await minify(input, { compress: true, mangle: false });
      return result.code || '';
    });

  const handleObfuscate = () =>
    runAsync(async () => {
      const JavaScriptObfuscator = (await import('javascript-obfuscator')).default;
      const result = JavaScriptObfuscator.obfuscate(input, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.2,
        stringArray: true,
        stringArrayThreshold: 0.5,
        renameGlobals: false,
      });
      return result.getObfuscatedCode();
    });

  const handleEvalPack = () =>
    runAsync(async () => {
      const { minify } = await import('terser');
      const result = await minify(input, {
        compress: true,
        mangle: { toplevel: true },
        output: { beautify: false },
      });
      const code = result.code || '';
      return `eval(${JSON.stringify(code)});`;
    });

  const handleHighCompress = () =>
    runAsync(async () => {
      const { minify } = await import('terser');
      const result = await minify(input, {
        compress: { passes: 3, pure_getters: true, unsafe: true, unsafe_math: true },
        mangle: { toplevel: true },
        output: { beautify: false },
      });
      return result.code || '';
    });

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleInputScrollTop = () => {
    viewRef.current?.scrollDOM.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOutputScrollTop = () => {
    if (highlight && outputViewRef.current) {
      outputViewRef.current.scrollDOM.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      outputRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.inputPane} style={{ width: `${splitPercent}%` }}>
        <ToolSection
          fill
          bodyVariant="noPad"
          title={mt('jsInput')}
          icon={<VscCode />}
          actions={
            <ResponsiveActions
              actions={[
                { label: mt('beautify'), onClick: handleBeautify, icon: <VscWand /> },
                { label: mt('minify'), onClick: handleMinify, icon: <VscArrowDown /> },
                { label: mt('obfuscate'), onClick: handleObfuscate, icon: <VscLock /> },
                { label: mt('evalPack'), onClick: handleEvalPack, icon: <VscPlay /> },
                { label: mt('highCompress'), onClick: handleHighCompress, icon: <VscRocket /> },
                {
                  label: mt('clear'),
                  onClick: () => {
                    setInput('');
                    setOutput('');
                    setError('');
                    setHighlight(false);
                  },
                  icon: <VscTrash />,
                },
              ]}
            />
          }
        >
          <div className={styles.editorWrap}>
            <div className={styles.editorBody} ref={editorRef} />
            <button
              className={`${styles.scrollTopBtn} ${showInputScrollTop ? styles.scrollTopVisible : ''}`}
              onClick={handleInputScrollTop}
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

      <div className={styles.outputPane} style={{ width: `${100 - splitPercent}%` }}>
        <ToolSection
          fill
          bodyVariant="noPad"
          title={mt('result')}
          icon={<VscOutput />}
          actions={
            <ResponsiveActions
              actions={[
                { label: copied ? mt('copied') : mt('copy'), onClick: handleCopy, icon: <VscCopy /> },
              ]}
            />
          }
        >
          <div className={styles.outputBody}>
            {processing ? (
              <div className={styles.processing}>{mt('processing')}</div>
            ) : error ? (
              <div className={styles.outputContent} ref={outputRef}>
                <pre className={styles.error}>{error}</pre>
              </div>
            ) : highlight && output ? (
              <div className={styles.editorBody} ref={outputEditorRef} />
            ) : output ? (
              <div className={styles.outputContent} ref={outputRef}>
                <pre className={styles.outputText}>{output}</pre>
              </div>
            ) : null}
            <button
              className={`${styles.scrollTopBtn} ${(highlight ? showOutputScrollTop : false) ? styles.scrollTopVisible : ''}`}
              onClick={handleOutputScrollTop}
              aria-label={mt('scrollTop')}
            >
              <VscChevronUp />
            </button>
          </div>
          <div className={styles.statusBar}>
            <span>
              {mt('chars')}: {outputStats.length}
            </span>
            <span>
              {mt('lines')}: {outputStats.lines}
            </span>
          </div>
        </ToolSection>
      </div>
    </div>
  );
}
