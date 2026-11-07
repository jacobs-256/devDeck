/** Markdown rendering (GFM). HTML must be sanitized before it reaches the DOM. */

import { marked } from 'marked';

export interface MarkdownStats {
  words: number;
  characters: number;
  lines: number;
}

export function renderMarkdown(source: string): string {
  return marked.parse(source, { gfm: true, breaks: false, async: false });
}

export function markdownStats(source: string): MarkdownStats {
  const trimmed = source.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    characters: source.length,
    lines: source ? source.split('\n').length : 0,
  };
}

/** Extract heading levels/text for a table of contents preview. */
export function extractHeadings(source: string): Array<{ level: number; text: string }> {
  return source
    .split('\n')
    .map((line) => {
      const match = /^(#{1,6})\s+(.*)$/.exec(line);
      if (!match) return null;
      const hashes = match[1] ?? '';
      return { level: hashes.length, text: (match[2] ?? '').trim() };
    })
    .filter((heading): heading is { level: number; text: string } => heading !== null);
}
