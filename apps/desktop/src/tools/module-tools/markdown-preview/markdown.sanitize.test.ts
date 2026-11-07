// @vitest-environment jsdom
import DOMPurify from 'dompurify';
import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown.model';

describe('markdown sanitization', () => {
  it('strips script tags and event handlers', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">');
    const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });

    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('alert(');
  });

  it('keeps safe markup intact', () => {
    const clean = DOMPurify.sanitize(renderMarkdown('# Hi\n\n[a](https://example.com)'), {
      USE_PROFILES: { html: true },
    });
    expect(clean).toContain('<h1');
    expect(clean).toContain('href="https://example.com"');
  });
});
