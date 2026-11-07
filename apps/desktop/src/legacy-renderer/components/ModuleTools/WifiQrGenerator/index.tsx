// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './WifiQrGenerator.module.css';
import QRCode from 'qrcode';
import ResponsiveActions from '../../ResponsiveActions';
import { getModuleLocale, useI18n } from '../../../i18n';

type Security = 'WPA' | 'WEP' | 'nopass';

function escapeWifiField(input: string): string {
  return String(input).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/:/g, '\\:');
}

function buildWifiPayload({
  ssid,
  password,
  security,
  hidden,
}: {
  ssid: string;
  password: string;
  security: Security;
  hidden: boolean;
}): string {
  const s = escapeWifiField(ssid.trim());
  const p = escapeWifiField(password);
  const parts: string[] = [`WIFI:T:${security};S:${s};`];
  if (security !== 'nopass') parts.push(`P:${p};`);
  if (hidden) parts.push('H:true;');
  parts.push(';');
  return parts.join('');
}

export default function WifiQrGenerator() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'WifiQrGenerator');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [ssid, setSsid] = useState('');
  const [security, setSecurity] = useState<Security>('WPA');
  const [password, setPassword] = useState('');
  const [hidden, setHidden] = useState(false);
  const [size, setSize] = useState(256);
  const [margin, setMargin] = useState(2);
  const [fgColor, setFgColor] = useState('#1e1e1e');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const payload = useMemo(() => {
    if (!ssid.trim()) return '';
    return buildWifiPayload({ ssid, password, security, hidden });
  }, [ssid, password, security, hidden]);

  const generateQr = useCallback(async () => {
    if (!payload) {
      setQrDataUrl(null);
      return;
    }
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      await QRCode.toCanvas(canvas, payload, {
        width: size,
        margin,
        color: { dark: fgColor, light: bgColor },
        errorCorrectionLevel: 'M',
      });
      setQrDataUrl(canvas.toDataURL('image/png'));
    } catch {
      setQrDataUrl(null);
    }
  }, [payload, size, margin, fgColor, bgColor]);

  useEffect(() => {
    void generateQr();
  }, [generateQr]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'wifi.png';
    a.click();
  };

  const handleCopy = async () => {
    if (!canvasRef.current) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvasRef.current!.toBlob(resolve, 'image/png'),
      );
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      return;
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.configPane}>
        <div className={styles.paneHeader}>
          <span>{mt('config')}</span>
        </div>
        <div className={styles.configBody}>
          <div className={styles.field}>
            <label className={styles.label}>{mt('ssid')}</label>
            <input
              className={styles.input}
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              placeholder={mt('ssidPlaceholder')}
              spellCheck={false}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{mt('security')}</label>
            <select
              className={styles.select}
              value={security}
              onChange={(e) => setSecurity(e.target.value as Security)}
            >
              <option value="WPA">{mt('securityWpa')}</option>
              <option value="WEP">{mt('securityWep')}</option>
              <option value="nopass">{mt('securityOpen')}</option>
            </select>
          </div>

          {security !== 'nopass' && (
            <div className={styles.field}>
              <label className={styles.label}>{mt('password')}</label>
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mt('passwordPlaceholder')}
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.checkboxRow}>
              <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
              <span>{mt('hidden')}</span>
            </label>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              {mt('size')}: {size}px
            </label>
            <input
              type="range"
              className={styles.slider}
              min={128}
              max={1024}
              step={8}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              {mt('margin')}: {margin}
            </label>
            <input
              type="range"
              className={styles.slider}
              min={0}
              max={10}
              step={1}
              value={margin}
              onChange={(e) => setMargin(Number(e.target.value))}
            />
          </div>

          <div className={styles.colorRow}>
            <div className={styles.field}>
              <label className={styles.label}>{mt('fgColor')}</label>
              <div className={styles.colorPicker}>
                <input type="color" value={fgColor} onChange={(e) => setFgColor(e.target.value)} />
                <span className={styles.colorValue}>{fgColor}</span>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{mt('bgColor')}</label>
              <div className={styles.colorPicker}>
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
                <span className={styles.colorValue}>{bgColor}</span>
              </div>
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{mt('payload')}</label>
            <textarea className={styles.textarea} value={payload} readOnly rows={3} />
          </div>
        </div>
      </div>

      <div className={styles.previewPane}>
        <div className={styles.paneHeader}>
          <span>{mt('preview')}</span>
          <ResponsiveActions
            actions={[
              { label: mt('save'), onClick: handleDownload },
              { label: copied ? mt('copied') : mt('copy'), onClick: handleCopy },
            ]}
          />
        </div>
        <div className={styles.previewBody}>
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          {qrDataUrl ? (
            <img className={styles.qrImage} src={qrDataUrl} alt="WiFi QR" />
          ) : (
            <p className={styles.placeholder}>{mt('placeholder')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
