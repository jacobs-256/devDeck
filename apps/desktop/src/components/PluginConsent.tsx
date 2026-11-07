import { useMemo } from 'react';
import type { CatalogEntry, InstalledPlugin } from '../types';
import { useI18n } from '../i18n';
import { buildConsent } from '../marketplace/consent';

interface PluginConsentProps {
  entry: CatalogEntry;
  installed?: InstalledPlugin;
  mode: 'install' | 'details';
  busy: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}

/**
 * Install consent / plugin detail dialog.
 *
 * Offers are capability-based: every declared permission is listed, sensitive
 * ones get a warning, and the HTTP/env allowlists are shown verbatim so the user
 * can judge what a plugin can reach before installing it.
 */
export function PluginConsent({ entry, installed, mode, busy, onConfirm, onClose }: PluginConsentProps) {
  const { t } = useI18n();
  const details = useMemo(() => buildConsent(entry, installed), [entry, installed]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={details.name}>
      <div className="modal">
        <header className="modal-header">
          <div>
            <h2>{details.name}</h2>
            <p className="muted small">
              {details.id} · v{details.version}
              {details.isUpdate && details.installedVersion
                ? ` (${t('consent.installedVersion', { version: details.installedVersion })})`
                : ''}{' '}
              · {details.sourceName}
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            {t('consent.close')}
          </button>
        </header>

        <div className="modal-body">
          <p>{entry.manifest.description}</p>

          <dl className="kv">
            <dt>{t('consent.author')}</dt>
            <dd>{details.author || '—'}</dd>
            <dt>{t('consent.license')}</dt>
            <dd>{details.license || '—'}</dd>
            {details.repository ? (
              <>
                <dt>{t('consent.repository')}</dt>
                <dd className="mono break">{details.repository}</dd>
              </>
            ) : null}
            {details.homepage ? (
              <>
                <dt>{t('consent.homepage')}</dt>
                <dd className="mono break">{details.homepage}</dd>
              </>
            ) : null}
          </dl>

          {details.sensitive.length > 0 ? (
            <p className="notice-inline">
              {t('consent.sensitiveWarning', { count: details.sensitive.length })}
            </p>
          ) : null}

          <div className="field">
            <span className="field-label">
              {t('consent.permissions', { count: details.permissions.length })}
            </span>
            {details.permissions.length === 0 ? (
              <p className="muted small">{t('consent.noPermissions')}</p>
            ) : (
              <ul className="permission-list">
                {details.permissions.map((permission) => (
                  <li key={permission.id} className={permission.sensitive ? 'sensitive' : ''}>
                    <div className="permission-head">
                      <strong>{permission.label}</strong>
                      <code className="tag">{permission.id}</code>
                      {permission.sensitive ? <span className="badge warn">privileged</span> : null}
                      {!permission.implemented ? <span className="badge bad">unavailable</span> : null}
                    </div>
                    <p className="muted small">{permission.summary}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {details.httpDomains.length > 0 ? (
            <div className="field">
              <span className="field-label">{t('consent.allowedHosts')}</span>
              <div className="tags">
                {details.httpDomains.map((domain) => (
                  <code key={domain} className="tag">
                    {domain}
                  </code>
                ))}
              </div>
            </div>
          ) : null}

          {details.envAllowlist.length > 0 ? (
            <div className="field">
              <span className="field-label">{t('consent.allowedEnv')}</span>
              <div className="tags">
                {details.envAllowlist.map((name) => (
                  <code key={name} className="tag">
                    {name}
                  </code>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="modal-footer">
          <button type="button" className="ghost" onClick={onClose}>
            {mode === 'details' ? t('consent.close') : t('consent.cancel')}
          </button>
          {mode === 'install' ? (
            <button type="button" className="primary" onClick={onConfirm} disabled={busy}>
              {busy
                ? t('consent.installing')
                : details.isUpdate
                  ? t('consent.updateTo', { version: details.version })
                  : t('consent.install')}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
