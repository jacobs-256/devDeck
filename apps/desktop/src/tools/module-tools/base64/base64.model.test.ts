import { describe, expect, it } from 'vitest';
import { byteLength, decodeBase64, encodeBase64 } from './base64.model';

describe('base64', () => {
  it('round-trips ASCII', () => {
    expect(encodeBase64('hello')).toBe('aGVsbG8=');
    expect(decodeBase64('aGVsbG8=')).toEqual({ ok: true, value: 'hello' });
  });

  it('round-trips non-ASCII text', () => {
    const text = '你好，DevToolBox 🧰';
    expect(decodeBase64(encodeBase64(text))).toEqual({ ok: true, value: text });
  });

  it('supports URL-safe output', () => {
    const encoded = encodeBase64('??>>', true);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeBase64(encoded)).toEqual({ ok: true, value: '??>>' });
  });

  it('ignores whitespace and missing padding', () => {
    expect(decodeBase64('aGVs\nbG8')).toEqual({ ok: true, value: 'hello' });
  });

  it('rejects invalid input', () => {
    const result = decodeBase64('not base64!!');
    expect(result.ok).toBe(false);
  });

  it('reports UTF-8 byte length', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('你')).toBe(3);
  });
});
