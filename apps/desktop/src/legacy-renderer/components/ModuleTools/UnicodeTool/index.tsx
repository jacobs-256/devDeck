// @ts-nocheck
import { useState, useCallback, useMemo } from 'react';
import { marked } from 'marked';
import { useI18n, getModuleLocale } from '../../../i18n';
import { HelpModal } from '@@components';
import styles from './UnicodeTool.module.css';

import helpEn from './locales/help-en.md?raw';

type Format = 'uEscape' | 'uPlus' | 'htmlDec' | 'htmlHex' | 'utf8Hex' | 'codePoints';

const FORMAT_LABELS: Record<Format, string> = {
  uEscape: '\\uXXXX',
  uPlus: 'U+XXXX',
  htmlDec: 'HTML &#NNN;',
  htmlHex: 'HTML &#xHHHH;',
  utf8Hex: 'UTF-8 Hex',
  codePoints: 'Code Points',
};

function unicodeEncode(str: string, fmt: Format): string {
  const chars = Array.from(str);
  switch (fmt) {
    case 'uEscape':
      return chars
        .map((c) => {
          const cp = c.codePointAt(0)!;
          if (cp > 0xffff) {
            const h = cp - 0x10000;
            return (
              '\\u' +
              (0xd800 + (h >> 10)).toString(16).padStart(4, '0') +
              '\\u' +
              (0xdc00 + (h & 0x3ff)).toString(16).padStart(4, '0')
            );
          }
          return '\\u' + cp.toString(16).padStart(4, '0');
        })
        .join('');
    case 'uPlus':
      return chars.map((c) => 'U+' + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')).join(' ');
    case 'htmlDec':
      return chars.map((c) => '&#' + c.codePointAt(0)! + ';').join('');
    case 'htmlHex':
      return chars.map((c) => '&#x' + c.codePointAt(0)!.toString(16).toUpperCase() + ';').join('');
    case 'utf8Hex':
      return Array.from(new TextEncoder().encode(str), (b) =>
        b.toString(16).padStart(2, '0').toUpperCase(),
      ).join(' ');
    case 'codePoints':
      return chars.map((c) => c.codePointAt(0)!.toString(10)).join(' ');
  }
}

function unicodeDecode(str: string, fmt: Format): string {
  switch (fmt) {
    case 'uEscape':
      return str.replace(/\\u([0-9a-fA-F]{4})/g, (_match: string, h: string) =>
        String.fromCharCode(parseInt(h, 16)),
      );
    case 'uPlus':
      return str.replace(/U\+([0-9a-fA-F]{4,6})/gi, (_match: string, h: string) =>
        String.fromCodePoint(parseInt(h, 16)),
      );
    case 'htmlDec':
      return str.replace(/&#(\d+);/g, (_match: string, d: string) => String.fromCodePoint(parseInt(d, 10)));
    case 'htmlHex':
      return str.replace(/&#x([0-9a-fA-F]+);/gi, (_match: string, h: string) =>
        String.fromCodePoint(parseInt(h, 16)),
      );
    case 'utf8Hex': {
      const bytes = str
        .trim()
        .split(/\s+/)
        .map((h) => parseInt(h, 16));
      return new TextDecoder().decode(new Uint8Array(bytes));
    }
    case 'codePoints':
      return str
        .trim()
        .split(/\s+/)
        .map((n) => String.fromCodePoint(parseInt(n, 10)))
        .join('');
  }
}

export default function UnicodeTool() {
  const { locale } = useI18n();
  const loc = getModuleLocale(locale, 'UnicodeTool');
  const mt = useCallback((k: string) => loc?.[k] ?? k, [loc]);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [format, setFormat] = useState<Format>('uEscape');
  const [error, setError] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const helpHtml = useMemo(() => {
    return marked.parse(helpEn, { breaks: true, gfm: true }) as string;
  }, []);
  const cp = useCallback((t: string) => {
    void navigator.clipboard.writeText(t);
  }, []);

  const handleEncode = useCallback(() => {
    setError('');
    try {
      setOutput(unicodeEncode(input, format));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [input, format]);

  const handleDecode = useCallback(() => {
    setError('');
    try {
      setOutput(unicodeDecode(input, format));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [input, format]);

  const handleSwap = useCallback(() => {
    setInput(output);
    setOutput(input);
  }, [input, output]);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={styles.formatLabel}>{mt('format')}</span>
        <select
          className={styles.select}
          value={format}
          onChange={(e) => setFormat(e.target.value as Format)}
        >
          {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => (
            <option key={f} value={f}>
              {f === 'utf8Hex' && locale === 'zh-CN'
                ? 'UTF-8 十六进制'
                : f === 'codePoints' && locale === 'zh-CN'
                  ? '码点'
                  : FORMAT_LABELS[f]}
            </option>
          ))}
        </select>
        <button className={styles.btn} onClick={handleEncode}>
          {mt('encode')} →
        </button>
        <button className={styles.btn} onClick={handleDecode}>
          ← {mt('decode')}
        </button>
        <button className={styles.btnSec} onClick={handleSwap}>
          ⇄ {mt('swap')}
        </button>
        <button
          className={styles.btnSec}
          onClick={() => {
            setInput('');
            setOutput('');
            setError('');
          }}
        >
          {mt('clear')}
        </button>
        <div style={{ flex: 1 }} />
        <button className={styles.btnSec} onClick={() => setShowHelp(true)}>
          ❓ {mt('help')}
        </button>
      </div>
      {error && <div className={styles.err}>{error}</div>}
      <div className={styles.panels}>
        <div className={styles.panel}>
          <div className={styles.panelLabel}>
            <span>{mt('inputPlaceholder')}</span>
            {input && (
              <button className={styles.cpBtn} onClick={() => cp(input)}>
                {mt('copy')}
              </button>
            )}
          </div>
          <textarea
            className={styles.area}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mt('inputPlaceholder')}
            spellCheck={false}
          />
        </div>
        <div className={styles.panel}>
          <div className={styles.panelLabel}>
            <span>{mt('outputPlaceholder')}</span>
            {output && (
              <button className={styles.cpBtn} onClick={() => cp(output)}>
                {mt('copy')}
              </button>
            )}
          </div>
          <textarea
            className={styles.area}
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder={mt('outputPlaceholder')}
            spellCheck={false}
          />
        </div>
      </div>
      {showHelp && (
        <HelpModal title={mt('helpTitle')} onClose={() => setShowHelp(false)}>
          <div dangerouslySetInnerHTML={{ __html: helpHtml }} />
        </HelpModal>
      )}
    </div>
  );
}
