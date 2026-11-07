/** Base64 encoding that is byte-exact for UTF-8 input. */

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

export function encodeBase64(input: string, urlSafe = false): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary);
  if (!urlSafe) return encoded;
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type DecodeResult = { ok: true; value: string } | { ok: false; error: string };

export function decodeBase64(input: string): DecodeResult {
  const normalized = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');

  if (normalized.length === 0) return { ok: true, value: '' };
  if (!BASE64_RE.test(normalized)) {
    return { ok: false, error: 'Input contains characters that are not valid Base64' };
  }

  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value };
  } catch {
    return { ok: false, error: 'Input is not valid Base64 or not valid UTF-8 text' };
  }
}

export function byteLength(input: string): number {
  return new TextEncoder().encode(input).length;
}
