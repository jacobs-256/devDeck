import { describe, expect, it } from 'vitest';
import { escapeUnicode, inspectText, unescapeUnicode } from './unicode.model';

describe('unicode', () => {
  it('leaves printable ASCII alone', () => {
    expect(escapeUnicode('abc 123')).toBe('abc 123');
  });

  it('escapes BMP characters and control characters', () => {
    expect(escapeUnicode('你')).toBe('\\u4f60');
    expect(escapeUnicode('a\tb')).toBe('a\\u0009b');
  });

  it('escapes astral characters as surrogate pairs or braces', () => {
    expect(escapeUnicode('😀')).toBe('\\ud83d\\ude00');
    expect(escapeUnicode('😀', 'brace')).toBe('\\u{1f600}');
  });

  it('unescapes both syntaxes', () => {
    expect(unescapeUnicode('\\u4f60\\u597d')).toEqual({ ok: true, value: '你好' });
    expect(unescapeUnicode('\\u{1f600}')).toEqual({ ok: true, value: '😀' });
    expect(unescapeUnicode('a\\u0009b')).toEqual({ ok: true, value: 'a\tb' });
  });

  it('round-trips mixed text', () => {
    const text = 'Hello 世界 😀\n';
    const escaped = escapeUnicode(text, 'brace');
    expect(unescapeUnicode(escaped)).toEqual({ ok: true, value: text });
  });

  it('rejects malformed escapes', () => {
    expect(unescapeUnicode('\\u12').ok).toBe(false);
    expect(unescapeUnicode('\\u{zzz}').ok).toBe(false);
    expect(unescapeUnicode('\\u{110000}').ok).toBe(false);
    expect(unescapeUnicode('\\u{d800}').ok).toBe(false);
  });

  it('inspects characters', () => {
    const [a, emoji] = inspectText('a😀');
    expect(a).toMatchObject({ char: 'a', codePoint: 'U+0061', decimal: 97, utf8Bytes: 1 });
    expect(emoji).toMatchObject({
      char: '😀',
      codePoint: 'U+1F600',
      utf8Bytes: 4,
      utf16Units: 2,
    });
  });

  it('limits inspection output', () => {
    expect(inspectText('abcdef', 3)).toHaveLength(3);
  });
});
