/** Chinese → pinyin conversion. */

import { pinyin } from 'pinyin-pro';

export type ToneStyle = 'symbol' | 'num' | 'none';

export function toPinyin(text: string, tone: ToneStyle = 'symbol', separator = ' '): string {
  if (!text.trim()) return '';
  const raw = pinyin(text, { toneType: tone, type: 'string', separator, nonZh: 'consecutive' });
  if (separator === '') return raw.replace(/\s+/g, '');
  // Non-Chinese runs can carry their own spaces; normalise around separators.
  return raw
    .split(separator)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(separator);
}

/** First letter of each character, e.g. "你好" → "nh". */
export function toInitials(text: string): string {
  if (!text.trim()) return '';
  return pinyin(text, {
    pattern: 'first',
    toneType: 'none',
    type: 'string',
    separator: '',
  });
}
