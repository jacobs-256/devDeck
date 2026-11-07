/** QR code generation (SVG output, no canvas dependency). */

import QRCode from 'qrcode';

export type QrLevel = 'L' | 'M' | 'Q' | 'H';

export interface QrOptions {
  level?: QrLevel;
  margin?: number;
  width?: number;
}

export const QR_MAX_INPUT = 2000;

export async function qrSvg(text: string, options: QrOptions = {}): Promise<string> {
  const value = text.trim();
  if (!value) {
    throw new Error('Enter some text to encode');
  }
  if (value.length > QR_MAX_INPUT) {
    throw new Error(`Input is longer than ${QR_MAX_INPUT} characters`);
  }

  return QRCode.toString(value, {
    type: 'svg',
    errorCorrectionLevel: options.level ?? 'M',
    margin: options.margin ?? 1,
    width: options.width ?? 320,
  });
}

/** Wrap SVG markup in a data URL so it can be used as an `<img src>`. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
