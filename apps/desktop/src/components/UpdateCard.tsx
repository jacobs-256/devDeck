import { useState } from 'react';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { useI18n } from '../i18n';

type Phase = 'idle' | 'checking' | 'current' | 'available' | 'installing' | 'ready' | 'error';

interface UpdateCardProps {
  currentVersion?: string;
}

/**
 * Update check + install, backed by `tauri-plugin-updater`.
 *
 * Updates are only available in a packaged build with a configured endpoint;
 * in dev the check fails and the card reports the error instead of hiding it.
 */
export function UpdateCard({ currentVersion }: UpdateCardProps) {
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

  return (
    <div className="card">
      <h2>{t('update.title')}</h2>
      <p className="muted small">
        Current version: <code>{currentVersion ?? 'unknown'}</code>. Updates are downloaded from GitHub
        Releases and verified with the update signing key.
      </p>

      <div className="field-row">
        <button
          type="button"
          className="ghost"
          onClick={() => void onCheck()}
          disabled={phase === 'checking' || phase === 'installing'}
        >
          {phase === 'checking' ? t('update.checking') : t('update.check')}
        </button>

        {phase === 'available' ? (
          <button type="button" className="primary" onClick={() => void onInstall()}>
            {t('update.install', { version: update?.version ?? '' })}
          </button>
        ) : null}
      </div>

      {percent !== null ? (
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      {message ? <p className={phase === 'error' ? 'error-text' : 'muted small'}>{message}</p> : null}

      {phase === 'available' && update?.body ? <pre className="result mono">{update.body}</pre> : null}
    </div>
  );
}
