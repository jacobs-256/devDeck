// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './RsaKeyPairGenerator.module.css';
import { ToolButton, ToolSection, ToolTextarea } from '@@components';
import { VscCopy, VscRefresh } from 'react-icons/vsc';
import { useI18n, getModuleLocale } from '../../../i18n';

type GenResult = { success: true; publicKey: string; privateKey: string } | { success: false; error: string };

function clampBits(v: number): number {
  if (v < 1024) return 1024;
  if (v > 8192) return 8192;
  return v;
}

function normalizeBits(v: number): number {
  const allowed = [1024, 2048, 3072, 4096];
  const hit = allowed.find((x) => x === v);
  return hit ?? 2048;
}

export default function RsaKeyPairGenerator() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'RsaKeyPairGenerator');
  const t = useCallback((key: string) => localeData?.[key] ?? key, [localeData]);

  const [bits, setBits] = useState(2048);
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inFlightBits = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (inFlightBits.current === bits) return;
    inFlightBits.current = bits;
    setError('');
    setLoading(true);
    try {
      const api = window.electronAPI;
      if (!api?.generateRSAKeyPair) throw new Error(t('notSupported'));
      const res = (await api.generateRSAKeyPair({ keySize: bits })) as GenResult;
      if (!res?.success) throw new Error(res?.error || t('generateError'));
      setPublicKey(res.publicKey);
      setPrivateKey(res.privateKey);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlightBits.current = null;
      setLoading(false);
    }
  }, [bits, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canDec = useMemo(() => bits > 1024, [bits]);
  const canInc = useMemo(() => bits < 4096, [bits]);

  const dec = () => {
    if (!canDec) return;
    const next = normalizeBits(clampBits(bits - 1024));
    setBits(next);
  };

  const inc = () => {
    if (!canInc) return;
    const next = normalizeBits(clampBits(bits + 1024));
    setBits(next);
  };

  const copy = (v: string) => {
    void navigator.clipboard.writeText(v);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>{t('title')}</div>
          <div className={styles.sub}>{t('subtitle')}</div>
        </div>
      </div>

      <div className={styles.controls}>
        <span className={styles.bitsLabel}>{t('bits')}</span>
        <div className={styles.bitsBox}>
          <input className={styles.bitsValue} value={bits} readOnly />
          <div className={styles.stepper}>
            <button type="button" className={styles.stepBtn} disabled={!canDec || loading} onClick={dec}>
              −
            </button>
            <button type="button" className={styles.stepBtn} disabled={!canInc || loading} onClick={inc}>
              +
            </button>
          </div>
        </div>
        <ToolButton onClick={() => void refresh()} disabled={loading} aria-busy={loading}>
          <VscRefresh className={loading ? 'animate-spin' : ''} />
          {loading ? t('generating') : t('refresh')}
        </ToolButton>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.grid} data-loading={loading ? '1' : '0'}>
        {loading ? (
          <div className={styles.loadingOverlay} role="status" aria-live="polite">
            <span className="spinner" aria-hidden="true" />
            {t('generating')}
          </div>
        ) : null}
        <ToolSection
          fill
          title={t('publicKey')}
          actions={
            <ToolButton onClick={() => copy(publicKey)} disabled={!publicKey}>
              <VscCopy />
              {t('copy')}
            </ToolButton>
          }
        >
          <div className={styles.monoWrap}>
            <ToolTextarea mono rows={18} value={publicKey} readOnly spellCheck={false} />
          </div>
        </ToolSection>

        <ToolSection
          fill
          title={t('privateKey')}
          actions={
            <ToolButton onClick={() => copy(privateKey)} disabled={!privateKey}>
              <VscCopy />
              {t('copy')}
            </ToolButton>
          }
        >
          <div className={styles.monoWrap}>
            <ToolTextarea mono rows={18} value={privateKey} readOnly spellCheck={false} />
          </div>
        </ToolSection>
      </div>
    </div>
  );
}
