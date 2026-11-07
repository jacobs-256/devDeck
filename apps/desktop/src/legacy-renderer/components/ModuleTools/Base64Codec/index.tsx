// @ts-nocheck
import { useState, useRef, useMemo, useEffect } from 'react';
import styles from './Base64Codec.module.css';
import ResponsiveActions from '../../ResponsiveActions';
import { JsonTreeView, ToolSection } from '@@components';
import Base64Help from './Base64Help';
import { useI18n, getModuleLocale } from '../../../i18n';
import {
  VscArrowLeft,
  VscArrowRight,
  VscArrowSwap,
  VscChevronUp,
  VscCopy,
  VscEdit,
  VscOutput,
  VscQuestion,
  VscTrash,
} from 'react-icons/vsc';

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

function base64Encode(text: string): string {
  // If the input is JSON, minify it before encoding
  let toEncode = text;
  try {
    const parsed = JSON.parse(text);
    toEncode = JSON.stringify(parsed);
  } catch {
    // Not JSON; encode as-is
  }
  const bytes = new TextEncoder().encode(toEncode);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64Decode(text: string): string {
  const binary = atob(text);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export default function Base64Codec() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'Base64Codec');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'encode' | 'decode'>('encode');
  const [copied, setCopied] = useState(false);
  const [splitPercent, setSplitPercent] = useState(50);
  const [showHelp, setShowHelp] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const inputScroll = useScrollTop(inputRef);
  const outputScroll = useScrollTop(outputRef);

  const { output, error, decodedJson } = useMemo(() => {
    if (!input.trim()) return { output: '', error: '', decodedJson: undefined };
    try {
      const result = mode === 'encode' ? base64Encode(input) : base64Decode(input);
      // In decode mode, try parsing JSON
      let json: unknown = undefined;
      if (mode === 'decode' && result) {
        try {
          json = JSON.parse(result);
        } catch {
          /* not JSON */
        }
      }
      return { output: result, error: '', decodedJson: json };
    } catch (e) {
      return { output: '', error: (e as Error).message, decodedJson: undefined };
    }
  }, [input, mode]);

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

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSwap = () => {
    setInput(output);
    setMode((m) => (m === 'encode' ? 'decode' : 'encode'));
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.inputPane} style={{ width: `${splitPercent}%` }}>
        <ToolSection
          fill
          bodyVariant="noPad"
          title={mt('input')}
          icon={<VscEdit />}
          actions={
            <ResponsiveActions
              actions={[
                {
                  label: mt('encode'),
                  onClick: () => setMode('encode'),
                  active: mode === 'encode',
                  icon: <VscArrowRight />,
                },
                {
                  label: mt('decode'),
                  onClick: () => setMode('decode'),
                  active: mode === 'decode',
                  icon: <VscArrowLeft />,
                },
                { label: mt('swap'), onClick: handleSwap, icon: <VscArrowSwap /> },
                { label: mt('clear'), onClick: () => setInput(''), icon: <VscTrash /> },
                { label: mt('help'), onClick: () => setShowHelp(true), icon: <VscQuestion /> },
              ]}
            />
          }
        >
          <div className={styles.textareaWrap}>
            <textarea
              ref={inputRef}
              className={styles.textarea}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === 'encode' ? mt('encodePlaceholder') : mt('decodePlaceholder')}
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
          title={mode === 'encode' ? mt('encodeResult') : mt('decodeResult')}
          icon={<VscOutput />}
          actions={
            <ResponsiveActions
              actions={[
                { label: copied ? mt('copied') : mt('copy'), onClick: handleCopy, icon: <VscCopy /> },
              ]}
            />
          }
        >
          <div className={styles.outputBody} ref={outputRef}>
            {error ? (
              <pre className={styles.error}>{error}</pre>
            ) : decodedJson !== undefined ? (
              <JsonTreeView data={decodedJson} defaultCollapsedDepth={3} />
            ) : output ? (
              <pre className={styles.outputText}>{output}</pre>
            ) : null}
            <button
              className={`${styles.scrollTopBtn} ${outputScroll.show ? styles.scrollTopVisible : ''}`}
              onClick={outputScroll.scrollToTop}
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
      {showHelp && <Base64Help onClose={() => setShowHelp(false)} />}
    </div>
  );
}
