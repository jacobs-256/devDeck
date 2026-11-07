import { describe, expect, it } from 'vitest';
import { generateUuids, uuidV4, uuidV7 } from './uuid.model';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('uuid', () => {
  it('generates v4 with the right version and variant bits', () => {
    const value = uuidV4();
    expect(value).toMatch(UUID_RE);
    expect(value[14]).toBe('4');
    expect(['8', '9', 'a', 'b']).toContain(value[19]);
  });

  it('generates v7 with the right version and variant bits', () => {
    const value = uuidV7(1700000000000);
    expect(value).toMatch(UUID_RE);
    expect(value[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(value[19]);
  });

  it('encodes the timestamp in the first 48 bits', () => {
    const now = 1700000000123;
    const value = uuidV7(now);
    const timestampHex = value.replace(/-/g, '').slice(0, 12);
    expect(Number.parseInt(timestampHex, 16)).toBe(now);
  });

  it('sorts v7 values generated at increasing times', () => {
    const earlier = uuidV7(1000);
    const later = uuidV7(2000);
    expect(earlier < later).toBe(true);
  });

  it('generates unique values', () => {
    const values = generateUuids(200, 'v4');
    expect(new Set(values).size).toBe(200);
  });

  it('clamps the requested count', () => {
    expect(generateUuids(0, 'v4')).toHaveLength(1);
    expect(generateUuids(10_000, 'v7')).toHaveLength(500);
  });
});
