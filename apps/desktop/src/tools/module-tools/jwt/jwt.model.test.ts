import { describe, expect, it } from 'vitest';
import { decodeJwt, formatEpoch } from './jwt.model';
import { encodeBase64 } from '../base64/base64.model';

function makeToken(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'HS256', typ: 'JWT' },
): string {
  const encode = (value: unknown) => encodeBase64(JSON.stringify(value), true);
  return `${encode(header)}.${encode(payload)}.signature`;
}

describe('jwt decode', () => {
  it('decodes header and payload', () => {
    const token = makeToken({ sub: '123', name: 'Ada' });
    const result = decodeJwt(token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.header['alg']).toBe('HS256');
    expect(result.value.payload['sub']).toBe('123');
    expect(result.value.signature).toBe('signature');
  });

  it('strips a Bearer prefix', () => {
    const token = makeToken({ sub: '1' });
    expect(decodeJwt(`Bearer ${token}`).ok).toBe(true);
  });

  it('marks expired tokens', () => {
    const token = makeToken({ exp: 1000 });
    const result = decodeJwt(token, 2_000_000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('expired');
  });

  it('marks not-yet-valid tokens', () => {
    const token = makeToken({ nbf: 5000 });
    const result = decodeJwt(token, 1_000);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('not-yet-valid');
  });

  it('reports missing expiry', () => {
    const result = decodeJwt(makeToken({ sub: '1' }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('no-expiry');
  });

  it('rejects malformed tokens', () => {
    expect(decodeJwt('only-one-part').ok).toBe(false);
    expect(decodeJwt('a.b.c').ok).toBe(false);
    expect(decodeJwt('').ok).toBe(false);
  });

  it('formats epochs as ISO dates', () => {
    expect(formatEpoch(0)).toBe('1970-01-01T00:00:00.000Z');
    expect(formatEpoch(null)).toBe('—');
  });
});
