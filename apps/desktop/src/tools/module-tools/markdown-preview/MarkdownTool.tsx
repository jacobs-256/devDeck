import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { SafeHtml } from '../../../components/SafeHtml';
import { extractHeadings, markdownStats, renderMarkdown } from './markdown.model';

const SAMPLE = `# DevDeck

A **developer toolbox** with a plugin marketplace.

## Features

- Markdown preview
- Base64 codec
- IPv4 calculator

\`\`\`ts
const tools = ['markdown', 'base64'];
\`\`\`

| Column | Value |
| --- | --- |
| Rendered | GFM |
| Sanitized | DOMPurify |

> Preview HTML is sanitized before rendering.
`;

export default function MarkdownTool() {
  const { t } = useI18n();
  const [source, setSource] = useState(SAMPLE);
  const [showHeadings, setShowHeadings] = useState(false);

  const html = useMemo(() => renderMarkdown(source), [source]);
  const stats = useMemo(() => markdownStats(source), [source]);
  const headings = useMemo(() => extractHeadings(source), [source]);

  return (
    <div className="tool-body">
      <div className="split">
        <label className="field">
          <span className="field-label">Markdown</span>
          <textarea
            className="mono"
            rows={18}
            value={source}
            spellCheck={false}
            onChange={(event) => setSource(event.target.value)}
          />
        </label>

        <div className="field">
          <span className="field-label">{t('common.output')}</span>
          <div className="preview-pane">
            <SafeHtml html={html} className="markdown-body" />
          </div>
        </div>
      </div>

      <div className="field-row">
        <span className="muted small">
          {t('tool.markdown-preview.stats', {
            words: stats.words,
            characters: stats.characters,
            lines: stats.lines,
          })}
        </span>
        <button
          type="button"
          className="ghost"
          onClick={() => setShowHeadings((value) => !value)}
          disabled={headings.length === 0}
        >
          {showHeadings ? t('tool.markdown-preview.hideOutline') : t('tool.markdown-preview.showOutline')}
        </button>
      </div>

      {showHeadings ? (
        <ul className="outline">
          {headings.map((heading, index) => (
            <li key={`${heading.text}-${index}`} style={{ paddingLeft: (heading.level - 1) * 14 }}>
              {heading.text}
            </li>
          ))}
        </ul>
      ) : null}

      <p className="muted small">{t('tool.markdown-preview.note')}</p>
    </div>
  );
}
