import { describe, expect, it } from 'vitest';
import { toInitials, toPinyin } from './pinyin.model';

describe('pinyin', () => {
  it('converts with tone marks', () => {
    expect(toPinyin('你好')).toBe('nǐ hǎo');
  });

  it('converts with tone numbers and without tones', () => {
    expect(toPinyin('你好', 'num')).toBe('ni3 hao3');
    expect(toPinyin('你好', 'none')).toBe('ni hao');
  });

  it('honours a custom separator', () => {
    expect(toPinyin('你好', 'none', '-')).toBe('ni-hao');
  });

  it('keeps non-Chinese text', () => {
    expect(toPinyin('hello 世界', 'none')).toBe('hello shi jie');
  });

  it('produces initials', () => {
    expect(toInitials('你好世界')).toBe('nhsj');
  });

  it('returns empty output for blank input', () => {
    expect(toPinyin('   ')).toBe('');
    expect(toInitials('')).toBe('');
  });
});
