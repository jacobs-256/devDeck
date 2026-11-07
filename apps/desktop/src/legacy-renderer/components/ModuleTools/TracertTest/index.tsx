// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n, getModuleLocale } from '../../../i18n';
import styles from './TracertTest.module.css';

const HOPS_OPTIONS = [15, 30, 50, 64];

export default function TracertTest() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'TracertTest');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [host, setHost] = useState('');
  const [maxHops, setMaxHops] = useState(30);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const handlersRef = useRef<{ data: unknown; error: unknown; done: unknown } | null>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, error]);

  const cleanup = useCallback(() => {
    if (handlersRef.current) {
      window.electronAPI?.offTracertListeners(
        handlersRef.current.data,
        handlersRef.current.error,
        handlersRef.current.done,
      );
      handlersRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      window.electronAPI?.tracertStop();
    };
  }, [cleanup]);

  const handleTrace = () => {
    const target = host.trim();
    if (!target) {
      setError(mt('hostRequired'));
      return;
    }
    cleanup();
    setLoading(true);
    setError('');
    setOutput('');

    const dataHandler = window.electronAPI?.onTracertData((data: string) => {
      setOutput((prev) => prev + data);
    });
    const errorHandler = window.electronAPI?.onTracertError((err: string) => {
      setError(err);
    });
    const doneHandler = window.electronAPI?.onTracertDone(() => {
      setLoading(false);
      cleanup();
    });
    handlersRef.current = { data: dataHandler, error: errorHandler, done: doneHandler };

    window.electronAPI?.tracertStart(target, maxHops);
  };

  const handleStop = () => {
    window.electronAPI?.tracertStop();
    setLoading(false);
    cleanup();
  };

  const handleClear = () => {
    setOutput('');
    setError('');
  };
  const handleCopy = () => {
    if (output) void navigator.clipboard.writeText(output);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) handleTrace();
  };

  return (
    <div className={styles.container}>
      <div className={styles.inputBar}>
        <span className={styles.label}>{mt('host')}</span>
        <input
          className={styles.hostInput}
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mt('placeholder')}
          spellCheck={false}
          disabled={loading}
        />
        <span className={styles.label}>{mt('maxHops')}</span>
        <select
          className={styles.hopsSelect}
          value={maxHops}
          onChange={(e) => setMaxHops(Number(e.target.value))}
          disabled={loading}
        >
          {HOPS_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {loading ? (
          <button className={`${styles.actionBtn} ${styles.stopBtn}`} onClick={handleStop}>
            {mt('stop')}
          </button>
        ) : (
          <button className={`${styles.actionBtn} ${styles.primaryBtn}`} onClick={handleTrace}>
            {mt('trace')}
          </button>
        )}
        <button className={styles.actionBtn} onClick={handleCopy} disabled={!output}>
          {mt('copy')}
        </button>
        <button className={styles.actionBtn} onClick={handleClear}>
          {mt('clear')}
        </button>
      </div>
      <div className={styles.outputArea} ref={outputRef}>
        {!output && !error && !loading && <div className={styles.placeholder}>{mt('emptyHint')}</div>}
        {error && <div className={`${styles.output} ${styles.error}`}>{error}</div>}
        {output && <pre className={styles.output}>{output}</pre>}
      </div>
    </div>
  );
}
