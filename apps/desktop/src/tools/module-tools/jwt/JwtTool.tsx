import { useMemo, useState } from 'react';
import { useI18n, type MessageKey } from '../../../i18n';
import { decodeJwt, formatEpoch } from './jwt.model';

const STATUS_KEYS: Record<string, MessageKey> = {
  valid: 'tool.jwt.statusValid',
  expired: 'tool.jwt.statusExpired',
  'not-yet-valid': 'tool.jwt.statusNotYet',
  'no-expiry': 'tool.jwt.statusNoExpiry',
};

export default function JwtTool() {
  const { t } = useI18n();
  const [token, setToken] = useState('');

  const decoded = useMemo(() => decodeJwt(token), [token]);
  const statusKey = decoded.ok ? STATUS_KEYS[decoded.value.status] : undefined;

  return (
    <div className="tool-body">
      <label className="field">
        <span className="field-label">JWT</span>
        <textarea
          className="mono"
          rows={6}
          placeholder={t('tool.jwt.placeholder')}
          value={token}
          spellCheck={false}
          onChange={(event) => setToken(event.target.value)}
        />
      </label>

      <p className="notice-inline">
        {t('tool.jwt.noticeBefore')}
        <strong>{t('tool.jwt.noticeBold')}</strong>
        {t('tool.jwt.noticeAfter')}
      </p>

      {!decoded.ok ? (
        token.trim() ? (
          <p className="error-text">{decoded.error}</p>
        ) : null
      ) : (
        <>
          <div className="field">
            <span className="field-label">{t('tool.jwt.status')}</span>
            <div>
              <span
                className={
                  decoded.value.status === 'expired' || decoded.value.status === 'not-yet-valid'
                    ? 'badge bad'
                    : 'badge ok'
                }
              >
                {statusKey ? t(statusKey) : decoded.value.status}
              </span>
            </div>
          </div>

          <div className="stat-grid">
            <div>
              <span className="field-label">alg</span>
              <code>{String(decoded.value.header['alg'] ?? '—')}</code>
            </div>
            <div>
              <span className="field-label">typ</span>
              <code>{String(decoded.value.header['typ'] ?? '—')}</code>
            </div>
            <div>
              <span className="field-label">{t('tool.jwt.issuedAt')}</span>
              <code>{formatEpoch(decoded.value.issuedAt)}</code>
            </div>
            <div>
              <span className="field-label">{t('tool.jwt.expiresAt')}</span>
              <code>{formatEpoch(decoded.value.expiresAt)}</code>
            </div>
          </div>

          <div className="field">
            <span className="field-label">{t('tool.jwt.header')}</span>
            <pre className="result mono">{JSON.stringify(decoded.value.header, null, 2)}</pre>
          </div>

          <div className="field">
            <span className="field-label">{t('tool.jwt.payload')}</span>
            <pre className="result mono">{JSON.stringify(decoded.value.payload, null, 2)}</pre>
          </div>

          <div className="field">
            <span className="field-label">{t('tool.jwt.signature')}</span>
            <code className="break">{decoded.value.signature || t('tool.jwt.empty')}</code>
          </div>
        </>
      )}
    </div>
  );
}
