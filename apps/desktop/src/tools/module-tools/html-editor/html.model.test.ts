import { describe, expect, it } from 'vitest';
import { buildPreviewDocument, htmlStats } from './html.model';

describe('html editor', () => {
  it('wraps fragments in a full document', () => {
    const doc = buildPreviewDocument('<h1>Hi</h1>');
    expect(doc).toContain('<!doctype html>');
    expect(doc).toContain('<h1>Hi</h1>');
    expect(doc).toContain('<style>');
  });

  it('keeps fragments untouched', () => {
    const fragment = '<p>a</p><script>alert(1)</script>';
    expect(buildPreviewDocument(fragment)).toContain(fragment);
  });

  it('counts characters, lines, and tags', () => {
    expect(htmlStats('<div><p>a</p></div>')).toEqual({ characters: 19, lines: 1, tags: 2 });
    expect(htmlStats('')).toEqual({ characters: 0, lines: 0, tags: 0 });
  });
});
