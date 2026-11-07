/**
 * Password-based text encryption (AES-256-GCM + PBKDF2-SHA256).
 *
 * Payload format: `DTB1.<salt>.<iv>.<ciphertext>` (Base64 parts). The format is
 * versioned so parameters can change without silently mis-decrypting old data.
 */

const VERSION = 'DTB1';
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

export type CryptoResult = { ok: true; value: string } | { ok: false; error: string };

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptText(text: string, password: string): Promise<CryptoResult> {
  if (!password) return { ok: false, error: 'Password is required' };

  try {
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveKey(password, salt);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
    const payload = [VERSION, toBase64(salt), toBase64(iv), toBase64(new Uint8Array(cipher))].join('.');
    return { ok: true, value: payload };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function decryptText(payload: string, password: string): Promise<CryptoResult> {
  if (!password) return { ok: false, error: 'Password is required' };

  const parts = payload.trim().split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    return { ok: false, error: `Expected a ${VERSION} payload` };
  }

  try {
    const salt = fromBase64(parts[1] ?? '');
    const iv = fromBase64(parts[2] ?? '');
    const cipher = fromBase64(parts[3] ?? '');
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return { ok: true, value: new TextDecoder().decode(plain) };
  } catch {
    return { ok: false, error: 'Wrong password or corrupted payload' };
  }
}
