// @ts-nocheck
import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './QrCodeGenerator.module.css';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import ResponsiveActions from '../../ResponsiveActions';
import { useI18n, getModuleLocale } from '../../../i18n';

type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
type CodeFormat = 'qrcode' | 'hanxin' | 'pdf417' | 'datamatrix';
type LogoShape = 'original' | 'rect' | 'roundRect' | 'circle';
type LogoPosition = 'center' | 'bottomRight';
type LogoShadow = 'none' | 'shadow';

const FORMAT_KEYS: { value: CodeFormat; labelKey: string }[] = [
  { value: 'qrcode', labelKey: 'QR Code' },
  { value: 'hanxin', labelKey: 'hanxin' },
  { value: 'pdf417', labelKey: 'PDF417' },
  { value: 'datamatrix', labelKey: 'Data Matrix' },
];
const EC_KEYS: { value: ErrorCorrectionLevel; labelKey: string }[] = [
  { value: 'L', labelKey: 'ecLow' },
  { value: 'M', labelKey: 'ecMedium' },
  { value: 'Q', labelKey: 'ecQuartile' },
  { value: 'H', labelKey: 'ecHigh' },
];
const SHAPE_KEYS: { value: LogoShape; labelKey: string }[] = [
  { value: 'original', labelKey: 'shapeOriginal' },
  { value: 'rect', labelKey: 'shapeRect' },
  { value: 'roundRect', labelKey: 'shapeRoundRect' },
  { value: 'circle', labelKey: 'shapeCircle' },
];
const POSITION_KEYS: { value: LogoPosition; labelKey: string }[] = [
  { value: 'center', labelKey: 'posCenter' },
  { value: 'bottomRight', labelKey: 'posBottomRight' },
];
const SHADOW_KEYS: { value: LogoShadow; labelKey: string }[] = [
  { value: 'none', labelKey: 'shadowNone' },
  { value: 'shadow', labelKey: 'shadowOn' },
];

const LOGO_FORMATS: CodeFormat[] = ['qrcode'];
const EC_FORMATS: CodeFormat[] = ['qrcode', 'hanxin'];
const DEFAULT_LOGO_RATIO = 0.2;

export default function QrCodeGenerator() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'QrCodeGenerator');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [text, setText] = useState('');
  const [format, setFormat] = useState<CodeFormat>('qrcode');
  const [size, setSize] = useState(256);
  const [margin, setMargin] = useState(2);
  const [fgColor, setFgColor] = useState('#1e1e1e');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [ecLevel, setEcLevel] = useState<ErrorCorrectionLevel>('H');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoShape, setLogoShape] = useState<LogoShape>('roundRect');
  const [logoRatio, setLogoRatio] = useState(DEFAULT_LOGO_RATIO);
  const [logoPosition, setLogoPosition] = useState<LogoPosition>('center');
  const [logoShadow, setLogoShadow] = useState<LogoShadow>('shadow');
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setLogoFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = () => setLogoPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setLogoPreview(null);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const drawLogo = useCallback(
    (canvas: HTMLCanvasElement): Promise<void> => {
      return new Promise((resolve) => {
        if (!logoPreview || !LOGO_FORMATS.includes(format)) {
          resolve();
          return;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve();
          return;
        }
        const img = new Image();
        img.onload = () => {
          const logoSize = canvas.width * logoRatio;
          const isOriginal = logoShape === 'original';
          const pad = isOriginal ? 0 : canvas.width * 0.03;
          const totalSize = logoSize + pad * 2;

          // Position
          let x: number, y: number;
          if (logoPosition === 'bottomRight') {
            x = canvas.width - totalSize - canvas.width * 0.02;
            y = canvas.height - totalSize - canvas.height * 0.02;
          } else {
            x = (canvas.width - totalSize) / 2;
            y = (canvas.height - totalSize) / 2;
          }
          const lx = x + pad,
            ly = y + pad;

          // Helper: trace the outer shape path
          const traceShape = (bx: number, by: number, bw: number, bh: number) => {
            ctx.beginPath();
            if (logoShape === 'circle') {
              const r = bw / 2;
              ctx.arc(bx + r, by + r, r, 0, Math.PI * 2);
            } else if (logoShape === 'roundRect') {
              ctx.roundRect(bx, by, bw, bh, canvas.width * 0.02);
            } else if (logoShape === 'rect') {
              ctx.rect(bx, by, bw, bh);
            }
          };

          if (!isOriginal) {
            // Clear QR modules around logo with a larger white area
            const clearPad = canvas.width * 0.02;
            traceShape(x - clearPad, y - clearPad, totalSize + clearPad * 2, totalSize + clearPad * 2);
            ctx.fillStyle = bgColor;
            ctx.fill();

            // Shadow — soft, light gray for a subtle elevated look
            if (logoShadow === 'shadow') {
              ctx.save();
              ctx.shadowColor = 'rgba(0,0,0,0.12)';
              ctx.shadowBlur = canvas.width * 0.025;
              ctx.shadowOffsetX = 0;
              ctx.shadowOffsetY = canvas.width * 0.004;
            }

            // Background fill
            traceShape(x, y, totalSize, totalSize);
            ctx.fillStyle = bgColor;
            ctx.fill();

            if (logoShadow === 'shadow') ctx.restore();

            // Subtle border — very light, almost invisible
            traceShape(x, y, totalSize, totalSize);
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = Math.max(1, canvas.width * 0.003);
            ctx.stroke();

            // Clip logo to shape
            ctx.save();
            traceShape(lx, ly, logoSize, logoSize);
            ctx.clip();
            ctx.drawImage(img, lx, ly, logoSize, logoSize);
            ctx.restore();
          } else {
            // Original: draw logo directly, no background/border/clip
            if (logoShadow === 'shadow') {
              ctx.save();
              ctx.shadowColor = 'rgba(0,0,0,0.35)';
              ctx.shadowBlur = canvas.width * 0.02;
              ctx.shadowOffsetX = canvas.width * 0.005;
              ctx.shadowOffsetY = canvas.width * 0.005;
            }
            ctx.drawImage(img, lx, ly, logoSize, logoSize);
            if (logoShadow === 'shadow') ctx.restore();
          }
          resolve();
        };
        img.onerror = () => resolve();
        img.src = logoPreview;
      });
    },
    [logoPreview, format, bgColor, logoRatio, logoPosition, logoShape, logoShadow],
  );

  type BwipRenderOptions = Parameters<typeof bwipjs.toCanvas>[1];
  type BwipRenderOptionsEx = BwipRenderOptions & { padding?: number; eclevel?: string };

  const generateBwip = useCallback(
    (canvas: HTMLCanvasElement) => {
      const ecMap: Record<string, Record<ErrorCorrectionLevel, string>> = {
        hanxin: { L: 'L1', M: 'L2', Q: 'L3', H: 'L4' },
      };
      const opts: BwipRenderOptionsEx = {
        bcid: format,
        text,
        scale: Math.max(2, Math.round(size / 100)),
        padding: margin * 2,
        backgroundcolor: bgColor.replace('#', ''),
        barcolor: fgColor.replace('#', ''),
      };
      if (EC_FORMATS.includes(format) && format !== 'qrcode') {
        const mapped = ecMap[format];
        if (mapped) opts.eclevel = mapped[ecLevel];
      }
      bwipjs.toCanvas(canvas, opts);
    },
    [format, text, size, margin, fgColor, bgColor, ecLevel],
  );

  const generateQr = useCallback(async () => {
    if (!text.trim()) {
      setQrDataUrl(null);
      return;
    }
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (format === 'qrcode') {
        await QRCode.toCanvas(canvas, text, {
          width: size,
          margin,
          color: { dark: fgColor, light: bgColor },
          errorCorrectionLevel: ecLevel,
        });
        await drawLogo(canvas);
      } else {
        generateBwip(canvas);
      }
      setQrDataUrl(canvas.toDataURL('image/png'));
    } catch {
      setQrDataUrl(null);
    }
  }, [text, format, size, margin, fgColor, bgColor, ecLevel, drawLogo, generateBwip]);

  useEffect(() => {
    void generateQr();
  }, [generateQr]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `${format}.png`;
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

  const hasLogo = LOGO_FORMATS.includes(format);
  const showLogoSettings = hasLogo && logoFile;

  return (
    <div className={styles.container}>
      <div className={styles.configPane}>
        <div className={styles.paneHeader}>
          <span>{mt('config')}</span>
        </div>
        <div className={styles.configBody}>
          <div className={styles.field}>
            <label className={styles.label}>{mt('format')}</label>
            <select
              className={styles.select}
              value={format}
              onChange={(e) => setFormat(e.target.value as CodeFormat)}
            >
              {FORMAT_KEYS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.labelKey === 'hanxin' ? mt(o.labelKey) : o.labelKey}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>{mt('content')}</label>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mt('contentPlaceholder')}
              rows={4}
              spellCheck={false}
            />
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
          {EC_FORMATS.includes(format) && (
            <div className={styles.field}>
              <label className={styles.label}>{mt('ecLevel')}</label>
              <select
                className={styles.select}
                value={ecLevel}
                onChange={(e) => setEcLevel(e.target.value as ErrorCorrectionLevel)}
              >
                {EC_KEYS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {mt(o.labelKey)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {hasLogo && (
            <>
              <div className={styles.field}>
                <label className={styles.label}>{mt('logo')}</label>
                <div className={styles.logoRow}>
                  <button className={styles.fileBtn} onClick={() => logoInputRef.current?.click()}>
                    {mt('selectFile')}
                  </button>
                  {logoFile && (
                    <>
                      <span className={styles.fileName}>{logoFile.name}</span>
                      <button className={styles.removeBtn} onClick={removeLogo}>
                        ✕
                      </button>
                    </>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>
              {showLogoSettings && (
                <>
                  <div className={styles.twoCol}>
                    <div className={styles.field}>
                      <label className={styles.label}>{mt('shape')}</label>
                      <select
                        className={styles.select}
                        value={logoShape}
                        onChange={(e) => setLogoShape(e.target.value as LogoShape)}
                      >
                        {SHAPE_KEYS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {mt(o.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>
                        {mt('logoSize')}: {Math.round(logoRatio * 100)}%
                        <button className={styles.resetBtn} onClick={() => setLogoRatio(DEFAULT_LOGO_RATIO)}>
                          {mt('reset')}
                        </button>
                      </label>
                      <input
                        type="range"
                        className={styles.slider}
                        min={0.1}
                        max={0.35}
                        step={0.01}
                        value={logoRatio}
                        onChange={(e) => setLogoRatio(Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <div className={styles.twoCol}>
                    <div className={styles.field}>
                      <label className={styles.label}>{mt('position')}</label>
                      <select
                        className={styles.select}
                        value={logoPosition}
                        onChange={(e) => setLogoPosition(e.target.value as LogoPosition)}
                      >
                        {POSITION_KEYS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {mt(o.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.field}>
                      <label className={styles.label}>{mt('shadow')}</label>
                      <select
                        className={styles.select}
                        value={logoShadow}
                        onChange={(e) => setLogoShadow(e.target.value as LogoShadow)}
                      >
                        {SHADOW_KEYS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {mt(o.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
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
            <img className={styles.qrImage} src={qrDataUrl} alt="QR Code" />
          ) : (
            <p className={styles.placeholder}>{mt('placeholder')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
