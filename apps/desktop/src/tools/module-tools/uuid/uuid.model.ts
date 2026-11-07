/** UUID generation (v4 random + v7 time-ordered). */

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function format(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = randomBytes(16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return format(bytes);
}

/**
 * RFC 9562 UUIDv7: 48-bit Unix milliseconds, version 7, 74 random bits.
 * Values generated in the same millisecond are not guaranteed to sort, but
 * values from different milliseconds are.
 */
export function uuidV7(nowMs: number = Date.now()): string {
  const bytes = randomBytes(16);
  const timestamp = BigInt(Math.max(0, Math.floor(nowMs)));

  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  return format(bytes);
}

export type UuidKind = 'v4' | 'v7';

export function generateUuids(count: number, kind: UuidKind): string[] {
  const safeCount = Math.max(1, Math.min(500, Math.floor(count) || 1));
  const generate = kind === 'v7' ? () => uuidV7() : uuidV4;
  return Array.from({ length: safeCount }, generate);
}
