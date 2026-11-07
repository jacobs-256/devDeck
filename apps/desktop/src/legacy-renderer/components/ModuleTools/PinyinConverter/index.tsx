// @ts-nocheck
import { useState, useCallback } from 'react';
import { pinyin } from 'pinyin-pro';
import styles from './PinyinConverter.module.css';
import { useI18n, getModuleLocale } from '../../../i18n';

type Mode = 'noTone' | 'withTone' | 'initial';

export default function PinyinConverter() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'PinyinConverter');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [activeMode, setActiveMode] = useState<Mode | null>(null);
  const [copied, setCopied] = useState(false);

  const convert = useCallback(
    (mode: Mode) => {
      if (!input.trim()) {
        setResult('');
        setActiveMode(null);
        return;
      }
      setActiveMode(mode);
      switch (mode) {
        case 'noTone':
          setResult(pinyin(input, { toneType: 'none' }));
          break;
        case 'withTone':
          setResult(pinyin(input, { toneType: 'symbol' }));
          break;
        case 'initial':
          setResult(pinyin(input, { pattern: 'initial' }).replace(/\s/g, ''));
          break;
      }
    },
    [input],
  );

  const handleCopy = useCallback(async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [result]);

  const handleClear = useCallback(() => {
    setInput('');
    setResult('');
    setActiveMode(null);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span>{mt('name')}</span>
        <div className={styles.toolbar}>
          <button
            className={`${styles.modeBtn}${activeMode === 'noTone' ? ` ${styles.active}` : ''}`}
            onClick={() => convert('noTone')}
          >
            {mt('noTone')}
          </button>
          <button
            className={`${styles.modeBtn}${activeMode === 'withTone' ? ` ${styles.active}` : ''}`}
            onClick={() => convert('withTone')}
          >
            {mt('withTone')}
          </button>
          <button
            className={`${styles.modeBtn}${activeMode === 'initial' ? ` ${styles.active}` : ''}`}
            onClick={() => convert('initial')}
          >
            {mt('initial')}
          </button>
        </div>
      </div>
      <div className={styles.body}>
        <textarea
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={mt('inputPlaceholder')}
        />
      </div>
      <div className={styles.resultHeader}>
        <span>{mt('resultLabel')}</span>
        <div className={styles.toolbar}>
          <button className={styles.actionBtn} onClick={handleCopy} disabled={!result}>
            {copied ? mt('copied') : mt('copy')}
          </button>
          <button className={styles.actionBtn} onClick={handleClear} disabled={!input && !result}>
            {mt('clear')}
          </button>
        </div>
      </div>
      <div className={styles.resultBox}>
        {result || <span className={styles.empty}>{mt('inputPlaceholder')}</span>}
      </div>
    </div>
  );
}
