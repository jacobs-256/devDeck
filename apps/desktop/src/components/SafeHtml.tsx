import DOMPurify from 'dompurify';

interface SafeHtmlProps {
  html: string;
  className?: string;
}

/**
 * Renders sanitized HTML.
 *
 * All generated HTML in DevToolBox must go through this component (or
 * `DOMPurify.sanitize` directly for non-DOM previews). The host CSP already
 * blocks inline scripts, and DOMPurify removes anything else dangerous.
 */
export function SafeHtml({ html, className }: SafeHtmlProps) {
  const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
