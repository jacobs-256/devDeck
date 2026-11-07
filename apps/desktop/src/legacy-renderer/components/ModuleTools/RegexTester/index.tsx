// @ts-nocheck
import { useState, useMemo, useCallback } from 'react';
import styles from './RegexTester.module.css';
import ResponsiveActions from '../../ResponsiveActions';
import RegexHelp from './RegexHelp';
import { useI18n, getModuleLocale } from '../../../i18n';

type TabType = 'test' | 'codegen';

interface PresetRegex {
  label: string;
  pattern: string;
  flags?: string;
}

const PRESETS: PresetRegex[] = [
  { label: 'presetChinese', pattern: '[\\u4e00-\\u9fa5]', flags: 'g' },
  { label: 'presetDoubleByte', pattern: '[^\\x00-\\xff]', flags: 'g' },
  { label: 'presetBlankLine', pattern: '\\n\\s*\\r', flags: 'g' },
  { label: 'presetEmail', pattern: '[\\w.-]+@[\\w.-]+\\.\\w+', flags: 'g' },
  { label: 'URL', pattern: "https?://[\\w\\-._~:/?#\\[\\]@!$&'()*+,;=%]+", flags: 'g' },
  { label: 'presetMobile', pattern: '1[3-9]\\d{9}', flags: 'g' },
  { label: 'presetPhone', pattern: '\\d{3}-\\d{8}|\\d{4}-\\d{7,8}', flags: 'g' },
  { label: 'presetNegFloat', pattern: '-\\d+\\.\\d+', flags: 'g' },
  { label: 'presetInteger', pattern: '-?\\d+', flags: 'g' },
  { label: 'presetPosFloat', pattern: '\\d+\\.\\d+', flags: 'g' },
  { label: 'presetQQ', pattern: '[1-9]\\d{4,}', flags: 'g' },
  { label: 'presetPostal', pattern: '[1-9]\\d{5}(?!\\d)', flags: 'g' },
  { label: 'presetIP', pattern: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}', flags: 'g' },
  { label: 'presetIDCard', pattern: '\\d{17}[\\dXx]|\\d{15}', flags: 'g' },
  { label: 'presetDate', pattern: '\\d{4}-\\d{1,2}-\\d{1,2}', flags: 'g' },
  { label: 'presetPosInt', pattern: '[1-9]\\d*', flags: 'g' },
  { label: 'presetNegInt', pattern: '-[1-9]\\d*', flags: 'g' },
  { label: 'presetUsername', pattern: '[a-zA-Z]\\w{3,15}', flags: 'g' },
];

const CODE_LANGUAGES = ['JavaScript', 'Python', 'Java', 'Go', 'C#', 'PHP', 'Ruby', 'Rust'] as const;
type CodeLang = (typeof CODE_LANGUAGES)[number];

function generateCode(pattern: string, flags: string, lang: CodeLang): string {
  const esc = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const escSingle = pattern.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  switch (lang) {
    case 'JavaScript':
      return `const regex = /${pattern}/${flags};\nconst result = regex.test(str);\nconst matches = str.match(regex);`;
    case 'Python':
      return `import re\n\npattern = r"${pattern}"\nresult = re.findall(pattern, text${flags.includes('i') ? ', re.IGNORECASE' : ''})`;
    case 'Java':
      return `import java.util.regex.*;\n\nPattern pattern = Pattern.compile("${esc}"${flags.includes('i') ? ', Pattern.CASE_INSENSITIVE' : ''});\nMatcher matcher = pattern.matcher(text);\nwhile (matcher.find()) {\n    System.out.println(matcher.group());\n}`;
    case 'Go':
      return `import "regexp"\n\nre := regexp.MustCompile(\`${pattern}\`)\nmatches := re.FindAllString(text, -1)`;
    case 'C#':
      return `using System.Text.RegularExpressions;\n\nvar regex = new Regex(@"${pattern}"${flags.includes('i') ? ', RegexOptions.IgnoreCase' : ''});\nvar matches = regex.Matches(text);`;
    case 'PHP':
      return `$pattern = '/${escSingle}/${flags}';\npreg_match_all($pattern, $text, $matches);`;
    case 'Ruby':
      return `regex = /${pattern}/${flags.replace('g', '')}\nmatches = text.scan(regex)`;
    case 'Rust':
      return `use regex::Regex;\n\nlet re = Regex::new(r"${pattern}").unwrap();\nlet matches: Vec<&str> = re.find_iter(text).map(|m| m.as_str()).collect();`;
    default:
      return '';
  }
}

export default function RegexTester() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'RegexTester');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [tab, setTab] = useState<TabType>('test');
  const [pattern, setPattern] = useState('');
  const [replacement, setReplacement] = useState('');
  const [testText, setTestText] = useState('');
  const [flagI, setFlagI] = useState(false);
  const [flagM, setFlagM] = useState(false);
  const [flagG, setFlagG] = useState(true);
  const [highlightRegex, setHighlightRegex] = useState(true);
  const [highlightMatch, setHighlightMatch] = useState(true);
  const [highlightNoMatch, setHighlightNoMatch] = useState(false);
  const [codeLang, setCodeLang] = useState<CodeLang>('JavaScript');
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const flags = useMemo(() => {
    let f = '';
    if (flagG) f += 'g';
    if (flagI) f += 'i';
    if (flagM) f += 'm';
    return f;
  }, [flagG, flagI, flagM]);

  const regex = useMemo(() => {
    if (!pattern) return null;
    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }, [pattern, flags]);

  const matches = useMemo(() => {
    if (!regex || !testText) return [];
    const result: { start: number; end: number; text: string }[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g');
    while ((m = re.exec(testText)) !== null) {
      result.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      if (m[0].length === 0) re.lastIndex++;
    }
    return result;
  }, [regex, testText]);

  const highlightedHtml = useMemo(() => {
    if (!testText) return '';
    if (!regex || matches.length === 0) {
      if (highlightNoMatch && testText) {
        return `<span class="${styles.noMatch}">${escapeHtml(testText)}</span>`;
      }
      return escapeHtml(testText);
    }
    const parts: string[] = [];
    let last = 0;
    for (const m of matches) {
      if (m.start > last) {
        const seg = testText.slice(last, m.start);
        parts.push(
          highlightNoMatch ? `<span class="${styles.noMatch}">${escapeHtml(seg)}</span>` : escapeHtml(seg),
        );
      }
      parts.push(`<span class="${styles.match}">${escapeHtml(m.text)}</span>`);
      last = m.end;
    }
    if (last < testText.length) {
      const seg = testText.slice(last);
      parts.push(
        highlightNoMatch ? `<span class="${styles.noMatch}">${escapeHtml(seg)}</span>` : escapeHtml(seg),
      );
    }
    return parts.join('');
  }, [testText, regex, matches, highlightNoMatch]);

  const replacedText = useMemo(() => {
    if (!regex || !testText || !replacement) return '';
    try {
      return testText.replace(regex, replacement);
    } catch {
      return '';
    }
  }, [regex, testText, replacement]);

  const selectPreset = useCallback((p: PresetRegex) => {
    setPattern(p.pattern);
    if (p.flags?.includes('g')) setFlagG(true);
  }, []);

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const handleReplace = () => {
    if (replacedText) setTestText(replacedText);
  };

  const codeOutput = useMemo(() => {
    if (!pattern) return '';
    return generateCode(pattern, flags, codeLang);
  }, [pattern, flags, codeLang]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'test' ? styles.tabActive : ''}`}
            onClick={() => setTab('test')}
          >
            {mt('tabTest')}
          </button>
          <button
            className={`${styles.tab} ${tab === 'codegen' ? styles.tabActive : ''}`}
            onClick={() => setTab('codegen')}
          >
            {mt('tabCodegen')}
          </button>
        </div>
        <button className={styles.helpBtn} onClick={() => setShowHelp(true)}>
          {mt('help')}
        </button>
      </div>

      {/* Common regex presets */}
      <div className={styles.presetsSection}>
        <div className={styles.presetsLabel}>{mt('presetsLabel')}</div>
        <div className={styles.presetsList}>
          {PRESETS.map((p) => (
            <button key={p.label} className={styles.presetBtn} onClick={() => selectPreset(p)}>
              {mt(p.label)}
            </button>
          ))}
        </div>
      </div>

      {tab === 'test' ? (
        <div className={styles.body}>
          {/* Regex input row */}
          <div className={styles.regexRow}>
            <input
              className={styles.regexInput}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={mt('regexPlaceholder')}
              spellCheck={false}
            />
            <input
              className={styles.replaceInput}
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder={mt('replacePlaceholder')}
              spellCheck={false}
            />
            <button className={styles.replaceBtn} onClick={handleReplace} disabled={!replacedText}>
              {mt('replaceBtn')}
            </button>
          </div>

          {/* Options */}
          <div className={styles.optionsRow}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={flagI} onChange={(e) => setFlagI(e.target.checked)} />
              {mt('flagCaseInsensitive')}
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={flagM} onChange={(e) => setFlagM(e.target.checked)} />
              {mt('flagMultiline')}
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={flagG} onChange={(e) => setFlagG(e.target.checked)} />
              {mt('flagGlobal')}
            </label>
            <label className={`${styles.checkLabel} ${highlightRegex ? styles.checkActive : ''}`}>
              <input
                type="checkbox"
                checked={highlightRegex}
                onChange={(e) => setHighlightRegex(e.target.checked)}
              />
              {mt('flagHighlightRegex')}
            </label>
            <label className={`${styles.checkLabel} ${highlightMatch ? styles.checkActive : ''}`}>
              <input
                type="checkbox"
                checked={highlightMatch}
                onChange={(e) => setHighlightMatch(e.target.checked)}
              />
              {mt('flagHighlightMatch')}
            </label>
            <label className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={highlightNoMatch}
                onChange={(e) => setHighlightNoMatch(e.target.checked)}
              />
              {mt('flagHighlightNoMatch')}
            </label>
          </div>

          {/* Test input + highlighted matches */}
          <div className={styles.testArea}>
            <textarea
              className={styles.testInput}
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder={mt('testPlaceholder')}
              spellCheck={false}
            />
          </div>
          {testText && highlightMatch && (
            <div className={styles.resultArea}>
              <div className={styles.resultLabel}>
                {mt('matchResult')} ({matches.length} {mt('matchCount')})
              </div>
              <div className={styles.highlighted} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
            </div>
          )}
          {matches.length > 0 && (
            <div className={styles.matchList}>
              <div className={styles.resultLabel}>{mt('matchDetail')}</div>
              <div className={styles.matchItems}>
                {matches.map((m, i) => (
                  <span key={i} className={styles.matchItem}>
                    <span className={styles.matchIndex}>#{i + 1}</span>
                    <span className={styles.matchText}>{m.text}</span>
                    <span className={styles.matchPos}>
                      [{m.start}-{m.end}]
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className={styles.body}>
          {/* Code generation */}
          <div className={styles.regexRow}>
            <input
              className={styles.regexInput}
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={mt('regexPlaceholder')}
              spellCheck={false}
            />
            <select
              className={styles.langSelect}
              value={codeLang}
              onChange={(e) => setCodeLang(e.target.value as CodeLang)}
            >
              {CODE_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          {codeOutput && (
            <div className={styles.codeSection}>
              <div className={styles.codeHeader}>
                <span>{codeLang} Code</span>
                <ResponsiveActions
                  actions={[
                    {
                      label: copied ? mt('copied') : mt('copyCode'),
                      onClick: () => handleCopyCode(codeOutput),
                    },
                  ]}
                />
              </div>
              <pre className={styles.codeBlock}>{codeOutput}</pre>
            </div>
          )}
        </div>
      )}

      {showHelp && <RegexHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
