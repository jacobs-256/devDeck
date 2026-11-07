// @ts-nocheck
import { useState, useRef, useEffect, useCallback } from 'react';
import { useI18n, getModuleLocale } from '../../../i18n';
import styles from './PingTest.module.css';

const COUNT_OPTIONS = [4, 8, 16, 32];

export default function PingTest() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'PingTest');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [host, setHost] = useState('');
  const [count, setCount] = useState(4);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const handlersRef = useRef<{ data: unknown; error: unknown; done: unknown } | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, error]);

  const cleanup = useCallback(() => {
    if (handlersRef.current) {
      window.electronAPI?.offPingListeners(
        handlersRef.current.data,
        handlersRef.current.error,
        handlersRef.current.done,
      );
      handlersRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
      window.electronAPI?.pingStop();
    };
  }, [cleanup]);

  const handlePing = () => {
    const target = host.trim();
    if (!target) {
      setError(mt('hostRequired'));
      return;
    }
    cleanup();
    setLoading(true);
    setError('');
    setOutput('');

    const dataHandler = window.electronAPI?.onPingData((data: string) => {
      setOutput((prev) => prev + data);
    });
    const errorHandler = window.electronAPI?.onPingError((err: string) => {
      setError(err);
    });
    const doneHandler = window.electronAPI?.onPingDone(() => {
      setLoading(false);
      cleanup();
    });
    handlersRef.current = { data: dataHandler, error: errorHandler, done: doneHandler };

    window.electronAPI?.pingStart(target, count);
  };

  const handleStop = () => {
    window.electronAPI?.pingStop();
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
    if (e.key === 'Enter' && !loading) handlePing();
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
        <span className={styles.label}>{mt('count')}</span>
        <select
          className={styles.countSelect}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          disabled={loading}
        >
          {COUNT_OPTIONS.map((n) => (
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
          <button className={`${styles.actionBtn} ${styles.primaryBtn}`} onClick={handlePing}>
            {mt('ping')}
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
