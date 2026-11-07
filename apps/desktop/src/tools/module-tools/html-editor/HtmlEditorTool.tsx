import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { buildPreviewDocument, htmlStats } from './html.model';

const SAMPLE = `<h1>Hello HTML</h1>
<p>Edit the markup on the left; the preview updates live.</p>
<ul>
  <li>Scripts are disabled in the preview</li>
  <li>Styles are scoped to the preview document</li>
</ul>`;

export default function HtmlEditorTool() {
  const { t } = useI18n();
  const [html, setHtml] = useState(SAMPLE);

  const preview = useMemo(() => buildPreviewDocument(html), [html]);
  const stats = useMemo(() => htmlStats(html), [html]);

  return (
    <div className="tool-body">
      <div className="split">
        <label className="field">
          <span className="field-label">HTML</span>
          <textarea
            className="mono"
            rows={18}
            value={html}
            spellCheck={false}
            onChange={(event) => setHtml(event.target.value)}
          />
        </label>

        <div className="field">
          <span className="field-label">{t('tool.html-editor.preview')}</span>
          <iframe
            className="preview-frame"
            title={t('tool.html-editor.iframeTitle')}
            sandbox=""
            srcDoc={preview}
          />
        </div>
      </div>

      <p className="muted small">
        {t('tool.html-editor.stats', {
          characters: stats.characters,
          lines: stats.lines,
          tags: stats.tags,
        })}
      </p>
    </div>
  );
}
