import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { replaceAll, runRegex } from './regex.model';

const SAMPLE_TEXT = 'Contact ada@example.com or grace@navy.mil — both are examples.';

export default function RegexTesterTool() {
  const { t } = useI18n();
  const [pattern, setPattern] = useState('(\\w+)@(\\w+\\.\\w+)');
  const [flags, setFlags] = useState('gi');
  const [text, setText] = useState(SAMPLE_TEXT);
  const [replacement, setReplacement] = useState('$1 [at] $2');

  const result = useMemo(() => runRegex(pattern, flags, text), [pattern, flags, text]);
  const replaced = useMemo(
    () => replaceAll(pattern, flags, text, replacement),
    [pattern, flags, text, replacement],
  );

  return (
    <div className="tool-body">
      <div className="field-row">
        <label className="field grow">
          <span className="field-label">{t('tool.regex.pattern')}</span>
          <input
            className="mono"
            value={pattern}
            spellCheck={false}
            onChange={(event) => setPattern(event.target.value)}
          />
        </label>
        <label className="field compact">
          <span className="field-label">{t('tool.regex.flags')}</span>
          <input
            className="mono"
            value={flags}
            spellCheck={false}
            onChange={(event) => setFlags(event.target.value)}
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">{t('tool.regex.testText')}</span>
        <textarea
          className="mono"
          rows={6}
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
        />
      </label>

      <div className="field">
        <span className="field-label">
          {t('tool.regex.matches')}{' '}
          {result.ok ? `(${result.matches.length}${result.truncated ? '+' : ''})` : ''}
        </span>
        {!result.ok ? (
          <p className="error-text">{result.error}</p>
        ) : result.matches.length === 0 ? (
          <p className="muted">{t('tool.regex.noMatches')}</p>
        ) : (
          <ol className="match-list">
            {result.matches.map((match) => (
              <li key={`${match.index}-${match.match}`}>
                <code className="break">{match.match || t('tool.regex.emptyMatch')}</code>
                <span className="muted small"> {t('tool.regex.at', { index: match.index })}</span>
                {match.groups.length > 0 ? (
                  <div className="muted small">
                    {t('tool.regex.groups')}{' '}
                    {match.groups.map((group, index) => `${index + 1}=${group || '∅'}`).join(', ')}
                  </div>
                ) : null}
                {Object.keys(match.namedGroups).length > 0 ? (
                  <div className="muted small">
                    {t('tool.regex.named')}{' '}
                    {Object.entries(match.namedGroups)
                      .map(([name, value]) => `${name}=${value}`)
                      .join(', ')}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <label className="field">
        <span className="field-label">{t('tool.regex.replacementHint')}</span>
        <input
          className="mono"
          value={replacement}
          spellCheck={false}
          onChange={(event) => setReplacement(event.target.value)}
        />
      </label>

      <div className="field">
        <span className="field-label">{t('tool.regex.replaced')}</span>
        {replaced.ok ? (
          <pre className="result mono">{replaced.value}</pre>
        ) : (
          <p className="error-text">{replaced.error}</p>
        )}
      </div>
    </div>
  );
}
