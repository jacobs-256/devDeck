import { describe, expect, it } from 'vitest';
import { dictionariesForTests, translate } from '../i18n';
import { filterTools, groupTools, TOOLS } from './registry';
import { CATEGORY_ORDER } from './types';

describe('tool registry', () => {
  it('keeps ids unique', () => {
    const ids = TOOLS.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has every tool name and description translated', () => {
    for (const tool of TOOLS) {
      for (const language of ['en', 'zh-CN'] as const) {
        const dictionary = dictionariesForTests[language];
        expect(dictionary[tool.nameKey], `${language} ${tool.nameKey}`).toBeTruthy();
        expect(dictionary[tool.descriptionKey], `${language} ${tool.descriptionKey}`).toBeTruthy();
      }
    }
  });

  it('covers every category', () => {
    const grouped = groupTools(TOOLS);
    expect(grouped.map((group) => group.category)).toEqual(
      CATEGORY_ORDER.filter((category) => grouped.some((group) => group.category === category)),
    );
    expect(grouped.reduce((sum, group) => sum + group.items.length, 0)).toBe(TOOLS.length);
  });

  it('searches English and translated text', () => {
    expect(filterTools('pinyin').map((tool) => tool.id)).toEqual(['pinyin']);
    expect(filterTools('b64').map((tool) => tool.id)).toEqual(['base64']);

    const translated = (tool: (typeof TOOLS)[number]) => [
      translate('zh-CN', tool.nameKey),
      translate('zh-CN', tool.descriptionKey),
    ];
    expect(filterTools('路由追踪', translated).map((tool) => tool.id)).toEqual(['tracert']);
    expect(filterTools('二维码', translated).map((tool) => tool.id)).toEqual(['wifi-qr', 'qr-code']);
  });
});
