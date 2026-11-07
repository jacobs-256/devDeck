import { describe, expect, it } from 'vitest';
import { compareVersions } from './version';

describe('compareVersions', () => {
  it('orders numeric segments', () => {
    expect(compareVersions('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });

  it('ignores prerelease and build metadata for ordering', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0+build.5', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.1-beta', '1.0.0')).toBeGreaterThan(0);
  });

  it('tolerates malformed input', () => {
    expect(compareVersions('abc', '0.0.0')).toBe(0);
    expect(compareVersions('1.x', '1.0.0')).toBe(0);
  });
});
