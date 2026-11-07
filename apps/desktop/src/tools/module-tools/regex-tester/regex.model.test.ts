import { describe, expect, it } from 'vitest';
import { normalizeFlags, replaceAll, runRegex } from './regex.model';

describe('regex tester', () => {
  it('normalizes flags and forces global matching', () => {
    expect(normalizeFlags('i')).toBe('ig');
    expect(normalizeFlags('ggi')).toBe('gi');
    expect(normalizeFlags('ix')).toBe('ig');
    expect(normalizeFlags('')).toBe('g');
  });

  it('collects matches with groups', () => {
    const result = runRegex('(\\w+)@(\\w+)\\.com', 'i', 'ADa@example.com bob@test.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]?.groups).toEqual(['ADa', 'example']);
    expect(result.matches[1]?.match).toBe('bob@test.com');
  });

  it('collects named groups', () => {
    const result = runRegex('(?<year>\\d{4})-(?<month>\\d{2})', '', '2026-11');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matches[0]?.namedGroups).toEqual({ year: '2026', month: '11' });
    }
  });

  it('terminates on zero-length matches', () => {
    const result = runRegex('a*', '', 'baa');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.matches.length).toBeGreaterThan(0);
  });

  it('caps the match count and reports truncation', () => {
    const result = runRegex('a', '', 'a'.repeat(50), 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matches).toHaveLength(10);
      expect(result.truncated).toBe(true);
    }
  });

  it('reports invalid patterns', () => {
    const result = runRegex('(', '', 'x');
    expect(result.ok).toBe(false);
  });

  it('replaces matches', () => {
    expect(replaceAll('\\s+', '', 'a b   c', '')).toEqual({ ok: true, value: 'abc' });
    expect(replaceAll('(', '', 'x', '').ok).toBe(false);
  });
});
