import { describe, expect, it } from 'vitest';
import { diffStats, diffText, unifiedPatch } from './diff.model';

describe('text diff', () => {
  it('marks added and removed lines', () => {
    const rows = diffText('a\nb\n', 'a\nc\n', 'lines');
    const removed = rows.filter((row) => row.type === 'removed').map((row) => row.text.trim());
    const added = rows.filter((row) => row.type === 'added').map((row) => row.text.trim());
    expect(removed).toContain('b');
    expect(added).toContain('c');
  });

  it('reports identical input as unchanged', () => {
    const rows = diffText('same', 'same', 'lines');
    expect(rows.every((row) => row.type === 'unchanged')).toBe(true);
    expect(diffStats(rows)).toEqual({ added: 0, removed: 0, unchanged: 1 });
  });

  it('diffs at word level', () => {
    const rows = diffText('hello world', 'hello there', 'words');
    expect(rows.some((row) => row.type === 'removed' && row.text.includes('world'))).toBe(true);
    expect(rows.some((row) => row.type === 'added' && row.text.includes('there'))).toBe(true);
  });

  it('diffs at character level', () => {
    const rows = diffText('abc', 'abd', 'chars');
    expect(rows.some((row) => row.type === 'removed' && row.text === 'c')).toBe(true);
    expect(rows.some((row) => row.type === 'added' && row.text === 'd')).toBe(true);
  });

  it('produces a unified patch', () => {
    const patch = unifiedPatch('a\nb\n', 'a\nc\n', 'old.txt', 'new.txt');
    expect(patch).toContain('--- old.txt');
    expect(patch).toContain('+++ new.txt');
    expect(patch).toContain('-b');
    expect(patch).toContain('+c');
  });

  it('counts changes', () => {
    const stats = diffStats(diffText('a\nb\n', 'a\nc\nd\n', 'lines'));
    expect(stats.removed).toBeGreaterThanOrEqual(1);
    expect(stats.added).toBeGreaterThanOrEqual(2);
  });
});
