import { describe, expect, it } from 'vitest';
import { dictionariesForTests, translate, type MessageKey } from './index';

describe('i18n', () => {
  it('keeps both dictionaries in sync', () => {
    const enKeys = Object.keys(dictionariesForTests.en).sort();
    const zhKeys = Object.keys(dictionariesForTests['zh-CN']).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  it('translates known keys', () => {
    expect(translate('en', 'nav.tools')).toBe('Tools');
    expect(translate('zh-CN', 'nav.tools')).toBe('工具');
  });

  it('interpolates variables', () => {
    expect(translate('en', 'tool.mqtt.messages', { count: 3 })).toBe('Messages (3)');
    expect(translate('zh-CN', 'tool.uuid.countLabel', { count: 2 })).toBe('2 个 UUID');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(translate('en', 'tool.base64.stats', { other: 'x' })).toBe(
      'Input: {input} bytes · Output: {output} characters',
    );
  });

  it('falls back to the key for unknown messages', () => {
    expect(translate('en', 'not.a.key' as MessageKey)).toBe('not.a.key');
  });

  it('translates tool body labels', () => {
    expect(translate('zh-CN', 'common.copy')).toBe('复制');
    expect(translate('zh-CN', 'tool.base64.encode')).toBe('编码');
    expect(translate('zh-CN', 'tool.uuid.countLabel', { count: 3 })).toBe('3 个 UUID');
    expect(translate('en', 'tool.url-codec.parseQuery')).toBe('Parse query string');
  });

  it('has a non-empty value for every key', () => {
    for (const language of ['en', 'zh-CN'] as const) {
      for (const key of Object.keys(dictionariesForTests.en) as MessageKey[]) {
        expect(translate(language, key).length).toBeGreaterThan(0);
      }
    }
  });
});
