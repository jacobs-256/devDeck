import { useRef, type ChangeEvent } from 'react';
import styles from './JsonEditor.module.css';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Tokenize JSON for the read-only highlight layer. */
export function highlightJson(value: string): string {
  const token = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let html = '';
  let last = 0;
  for (let match = token.exec(value); match; match = token.exec(value)) {
    html += escapeHtml(value.slice(last, match.index));
    const [text, stringValue, colon, literal] = match;
    if (stringValue !== undefined) {
      html += colon
        ? `<span class="json-key">${escapeHtml(stringValue)}</span>${escapeHtml(colon)}`
        : `<span class="json-string">${escapeHtml(stringValue)}</span>`;
    } else if (literal !== undefined) {
      const kind = literal === 'null' ? 'json-null' : 'json-boolean';
      html += `<span class="${kind}">${literal}</span>`;
    } else {
      html += `<span class="json-number">${text}</span>`;
    }
    last = match.index + text.length;
  }
  return html + escapeHtml(value.slice(last));
}

/**
 * Editable JSON field with a live syntax-highlight overlay.
 *
 * The textarea owns the caret and scroll; the `<pre>` is decorative and is
 * kept in sync on scroll so JSON stays highlighted while typing.
 */
export function JsonEditor({
  value,
  onChange,
  rows = 8,
  placeholder,
  autoFocus,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const syncScroll = () => {
    if (!preRef.current || !inputRef.current) return;
    preRef.current.scrollTop = inputRef.current.scrollTop;
    preRef.current.scrollLeft = inputRef.current.scrollLeft;
  };

  return (
    <div className={styles.editor} style={{ minHeight: `calc(${Math.max(rows, 2)} * 1.5em + 22px)` }}>
      <pre ref={preRef} className={styles.highlight} aria-hidden="true">
        <code
          dangerouslySetInnerHTML={{ __html: `${highlightJson(value)}${value.endsWith('\n') ? ' ' : ''}` }}
        />
      </pre>
      <textarea
        ref={inputRef}
        className={styles.input}
        value={value}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        onScroll={syncScroll}
      />
    </div>
  );
}
