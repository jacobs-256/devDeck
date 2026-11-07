import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { qrSvg, svgDataUrl } from '../qr-code/qr.model';
import { wifiQrPayload, type WifiSecurity } from './wifi-qr.model';

export default function WifiQrTool() {
  const { t } = useI18n();
  const [ssid, setSsid] = useState('My Network');
  const [password, setPassword] = useState('');
  const [security, setSecurity] = useState<WifiSecurity>('WPA');
  const [hidden, setHidden] = useState(false);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  const payload = useMemo(
    () => wifiQrPayload({ ssid, password, security, hidden }),
    [ssid, password, security, hidden],
  );

  useEffect(() => {
    let cancelled = false;
    if (!ssid.trim()) {
      setSvg('');
      setError('Enter a network name (SSID)');
      return;
    }
    void qrSvg(payload)
      .then((value) => {
        if (cancelled) return;
        setSvg(value);
        setError('');
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        setSvg('');
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, [payload, ssid]);

  return (
    <div className="tool-body">
      <div className="split">
        <div className="tool-body">
          <label className="field">
            <span className="field-label">{t('tool.wifi-qr.ssid')}</span>
            <input value={ssid} onChange={(event) => setSsid(event.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">{t('tool.wifi-qr.password')}</span>
            <input
              type="password"
              value={password}
              disabled={security === 'nopass'}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <div className="field-row">
            <label className="field compact">
              <span className="field-label">{t('tool.wifi-qr.security')}</span>
              <select value={security} onChange={(event) => setSecurity(event.target.value as WifiSecurity)}>
                <option value="WPA">WPA/WPA2</option>
                <option value="WEP">WEP</option>
                <option value="nopass">{t('tool.wifi-qr.open')}</option>
              </select>
            </label>

            <label className="checkbox">
              <input type="checkbox" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
              {t('tool.wifi-qr.hidden')}
            </label>
          </div>

          <div className="field">
            <div className="field-row">
              <span className="field-label">{t('tool.wifi-qr.payload')}</span>
              <CopyButton value={payload} />
            </div>
            <pre className="result mono">{payload}</pre>
          </div>
        </div>

        <div className="qr-preview">
          {error ? (
            <p className="error-text">{error}</p>
          ) : svg ? (
            <img src={svgDataUrl(svg)} alt={t('tool.wifi-qr.alt')} className="qr-image" />
          ) : (
            <p className="muted">{t('tool.qr-code.generating')}</p>
          )}
        </div>
      </div>

      <p className="muted small">{t('tool.wifi-qr.explanation')}</p>
    </div>
  );
}
