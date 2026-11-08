import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { VscBug, VscGithub, VscRefresh } from 'react-icons/vsc';
import brandMark from '../assets/brand-mark.svg';
import { useI18n } from '../i18n';
import styles from './AboutFooter.module.css';

type Phase = 'idle' | 'checking' | 'current' | 'available' | 'installing' | 'ready' | 'error';

const REPOSITORY = 'https://github.com/jacobs-256/devDeck';
const ISSUES = `${REPOSITORY}/issues`;

function openExternal(url: string) {
  void invoke('plugin:opener|open_url', { url }).catch(() => {
    window.open(url, '_blank', 'noopener,noreferrer');
  });
}

/** Footer identity + update actions, modeled on the ssh-hold-deck about card. */
export function AboutFooter({ name, version }: { name?: string; version?: string }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('idle');
  const [update, setUpdate] = useState<Update | null>(null);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<{ downloaded: number; total: number } | null>(null);

  const onCheck = async () => {
    setPhase('checking');
    setMessage(t('update.checkingMessage'));
    setProgress(null);
    try {
      const found = await check();
      if (!found) {
        setUpdate(null);
        setPhase('current');
        setMessage(t('update.latest'));
        return;
      }
      setUpdate(found);
      setPhase('available');
      setMessage(t('update.available', { version: found.version }));
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const onInstall = async () => {
    if (!update) return;
    setPhase('installing');
    setMessage(t('update.downloading'));
    let downloaded = 0;
    let total = 0;
    setProgress({ downloaded, total });
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0;
          setProgress({ downloaded, total });
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setProgress({ downloaded, total });
        } else {
          setMessage(t('update.installing'));
        }
      });
      setUpdate(null);
      setPhase('ready');
      setMessage(t('update.ready'));
    } catch (error) {
      setPhase('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : null;

  const status =
    phase === 'idle' ? (version ? t('about.currentVersion', { version: `v${version}` }) : '') : message;

  return (
    <footer className={styles.footer}>
      <div className={styles.identity}>
        <img className={styles.icon} src={brandMark} alt="" width={44} height={44} />
        <div className={styles.copy}>
          <h3>
            {name ?? 'DevDeck'} {version ? <span className={styles.version}>v{version}</span> : null}
          </h3>
          <p className={styles.subtitle}>{t('about.subtitle')}</p>
          <p
            className={`${styles.status}${phase === 'available' ? ` ${styles.available}` : ''}${
              phase === 'error' ? ` ${styles.error}` : ''
            }`}
            role="status"
            aria-live="polite"
          >
            {status}
          </p>
          {percent !== null ? (
            <progress className={styles.progress} max={100} value={percent} aria-label="Update progress">
              {percent}%
            </progress>
          ) : null}
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.action}
          onClick={() => void onCheck()}
          disabled={phase === 'checking' || phase === 'installing'}
        >
          <VscRefresh />
          {phase === 'checking' ? t('update.checking') : t('update.check')}
        </button>
        {phase === 'available' ? (
          <button type="button" className={styles.primary} onClick={() => void onInstall()}>
            {t('update.install', { version: update?.version ?? '' })}
          </button>
        ) : null}
        <button type="button" className={styles.action} onClick={() => openExternal(ISSUES)}>
          <VscBug />
          {t('about.reportIssue')}
        </button>
        <button type="button" className={styles.action} onClick={() => openExternal(REPOSITORY)}>
          <VscGithub />
          {t('about.github')}
        </button>
      </div>
    </footer>
  );
}
