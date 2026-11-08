import { useEffect, useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { qrSvg, svgDataUrl, type QrLevel } from './qr.model';

export default function QrCodeTool() {
  const { t } = useI18n();
  const [text, setText] = useState('https://github.com/jacobs-256/devDeck');
  const [level, setLevel] = useState<QrLevel>('M');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void qrSvg(text, { level })
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
  }, [text, level]);

  return (
    <div className="tool-body">
      <label className="field">
        <span className="field-label">{t('tool.qr-code.label')}</span>
        <textarea
          className="mono"
          rows={5}
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="field-row">
        <label className="field compact">
          <span className="field-label">{t('tool.qr-code.errorCorrection')}</span>
          <select value={level} onChange={(event) => setLevel(event.target.value as QrLevel)}>
            <option value="L">L (7%)</option>
            <option value="M">M (15%)</option>
            <option value="Q">Q (25%)</option>
            <option value="H">H (30%)</option>
          </select>
        </label>
        <CopyButton value={text} label={t('tool.qr-code.copyText')} />
      </div>

      <div className="qr-preview">
        {error ? (
          <p className="error-text">{error}</p>
        ) : svg ? (
          <img src={svgDataUrl(svg)} alt={t('tool.qr-code.alt')} className="qr-image" />
        ) : (
          <p className="muted">{t('tool.qr-code.generating')}</p>
        )}
      </div>

      <p className="muted small">{t('tool.qr-code.explanation')}</p>
    </div>
  );
}
