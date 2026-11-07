import { describe, expect, it } from 'vitest';
import { decryptText, encryptText } from './crypto.model';

describe('string encryption', () => {
  it('round-trips text', async () => {
    const encrypted = await encryptText('hello 世界', 'correct horse');
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    expect(encrypted.value.startsWith('DTB1.')).toBe(true);
    const decrypted = await decryptText(encrypted.value, 'correct horse');
    expect(decrypted).toEqual({ ok: true, value: 'hello 世界' });
  });

  it('produces a different payload each time', async () => {
    const first = await encryptText('same', 'pw');
    const second = await encryptText('same', 'pw');
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(first.value).not.toBe(second.value);
  });

  it('rejects a wrong password', async () => {
    const encrypted = await encryptText('secret', 'pw');
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    const decrypted = await decryptText(encrypted.value, 'other');
    expect(decrypted).toEqual({ ok: false, error: 'Wrong password or corrupted payload' });
  });

  it('rejects tampered payloads', async () => {
    const encrypted = await encryptText('secret', 'pw');
    if (!encrypted.ok) return;
    const parts = encrypted.value.split('.');
    const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${parts[3]?.slice(0, -4)}AAAA`;
    const decrypted = await decryptText(tampered, 'pw');
    expect(decrypted.ok).toBe(false);
  });

  it('rejects malformed payloads and empty passwords', async () => {
    expect(await decryptText('not-a-payload', 'pw')).toEqual({
      ok: false,
      error: 'Expected a DTB1 payload',
    });
    expect((await encryptText('x', '')).ok).toBe(false);
    expect((await decryptText('DTB1.x.y.z', '')).ok).toBe(false);
  });
});
