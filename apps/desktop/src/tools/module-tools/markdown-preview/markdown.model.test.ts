import { describe, expect, it } from 'vitest';
import { extractHeadings, markdownStats, renderMarkdown } from './markdown.model';

describe('markdown', () => {
  it('renders headings, emphasis, and code', () => {
    const html = renderMarkdown('# Title\n\n**bold** and `code`');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders GFM tables', () => {
    const html = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<table');
    expect(html).toContain('<td>1</td>');
  });

  it('renders fenced code blocks', () => {
    const html = renderMarkdown('```ts\nconst a = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('const a = 1;');
  });

  it('counts words, characters, and lines', () => {
    expect(markdownStats('one two\nthree')).toEqual({ words: 3, characters: 13, lines: 2 });
    expect(markdownStats('')).toEqual({ words: 0, characters: 0, lines: 0 });
  });

  it('extracts headings in order', () => {
    expect(extractHeadings('# A\n\n## B\n\ntext\n### C')).toEqual([
      { level: 1, text: 'A' },
      { level: 2, text: 'B' },
      { level: 3, text: 'C' },
    ]);
  });
});
