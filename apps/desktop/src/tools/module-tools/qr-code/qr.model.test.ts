import { describe, expect, it } from 'vitest';
import { QR_MAX_INPUT, qrSvg, svgDataUrl } from './qr.model';

describe('qr code', () => {
  it('renders an SVG', async () => {
    const svg = await qrSvg('hello');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('encodes longer content with a denser matrix', async () => {
    const short = await qrSvg('a');
    const long = await qrSvg('a'.repeat(200));
    expect(long.length).toBeGreaterThan(short.length);
  });

  it('honours the error-correction level', async () => {
    const low = await qrSvg('hello', { level: 'L' });
    const high = await qrSvg('hello', { level: 'H' });
    expect(low).not.toBe(high);
  });

  it('rejects empty and oversized input', async () => {
    await expect(qrSvg('   ')).rejects.toThrow(/Enter some text/);
    await expect(qrSvg('x'.repeat(QR_MAX_INPUT + 1))).rejects.toThrow(/longer than/);
  });

  it('produces a data URL', () => {
    expect(svgDataUrl('<svg></svg>')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
  });
});
