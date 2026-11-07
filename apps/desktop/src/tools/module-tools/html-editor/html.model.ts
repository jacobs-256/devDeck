/** HTML editor helpers: sandboxed preview document and basic statistics. */

export interface HtmlStats {
  characters: number;
  lines: number;
  tags: number;
}

const PREVIEW_STYLES = `
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #1b1d21;
    background: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    body { color: #e6e8ec; background: #0f1115; }
    a { color: #6ea8ff; }
  }
  img, video { max-width: 100%; height: auto; }
  pre { overflow: auto; }
`;

/**
 * Wrap an HTML fragment in a full document for `iframe srcdoc`.
 *
 * The iframe uses `sandbox=""` (no scripts, opaque origin) so previewed markup
 * cannot run code or reach the host document.
 */
export function buildPreviewDocument(fragment: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${PREVIEW_STYLES}</style>
</head>
<body>
${fragment}
</body>
</html>`;
}

export function htmlStats(html: string): HtmlStats {
  const tags = html.match(/<[a-zA-Z][^>]*>/g)?.length ?? 0;
  return {
    characters: html.length,
    lines: html ? html.split('\n').length : 0,
    tags,
  };
}
