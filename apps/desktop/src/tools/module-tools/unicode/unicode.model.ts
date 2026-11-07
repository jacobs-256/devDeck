/** Unicode escaping, unescaping, and character inspection. */

export type EscapeStyle = 'u' | 'brace';

export type ConvertResult = { ok: true; value: string } | { ok: false; error: string };

const isPrintableAscii = (codePoint: number) => codePoint >= 0x20 && codePoint <= 0x7e;

export function escapeUnicode(input: string, style: EscapeStyle = 'u'): string {
  let output = '';
  for (const character of input) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (isPrintableAscii(codePoint)) {
      output += character;
      continue;
    }

    if (codePoint > 0xffff) {
      if (style === 'brace') {
        output += `\\u{${codePoint.toString(16)}}`;
      } else {
        const offset = codePoint - 0x10000;
        const high = 0xd800 + (offset >> 10);
        const low = 0xdc00 + (offset & 0x3ff);
        output += `\\u${high.toString(16)}\\u${low.toString(16)}`;
      }
    } else {
      output += `\\u${codePoint.toString(16).padStart(4, '0')}`;
    }
  }
  return output;
}

export function unescapeUnicode(input: string): ConvertResult {
  let output = '';

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? '';
    if (character !== '\\' || input[index + 1] !== 'u') {
      output += character;
      continue;
    }

    if (input[index + 2] === '{') {
      const end = input.indexOf('}', index + 3);
      if (end === -1) return { ok: false, error: 'Unterminated \\u{…} escape' };
      const hex = input.slice(index + 3, end);
      if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) {
        return { ok: false, error: `Invalid escape \\u{${hex}}` };
      }
      const codePoint = Number.parseInt(hex, 16);
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return { ok: false, error: `Invalid code point U+${hex}` };
      }
      output += String.fromCodePoint(codePoint);
      index = end;
      continue;
    }

    const hex = input.slice(index + 2, index + 6);
    if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
      return { ok: false, error: `Invalid escape \\u${hex || '…'}` };
    }
    output += String.fromCharCode(Number.parseInt(hex, 16));
    index += 5;
  }

  return { ok: true, value: output };
}

export interface CharInfo {
  char: string;
  /** Canonical `U+XXXX` notation. */
  codePoint: string;
  decimal: number;
  utf8Bytes: number;
  utf16Units: number;
}

export function inspectText(input: string, limit = 200): CharInfo[] {
  return Array.from(input)
    .slice(0, limit)
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return {
        char: character,
        codePoint: `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
        decimal: codePoint,
        utf8Bytes: new TextEncoder().encode(character).length,
        utf16Units: character.length,
      };
    });
}
