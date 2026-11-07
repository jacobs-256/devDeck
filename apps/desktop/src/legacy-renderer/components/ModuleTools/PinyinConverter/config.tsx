// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import PinyinConverter from './index';
import { TbLanguageHiragana } from 'react-icons/tb';

const config: ModuleConfig = {
  id: 'core-pinyin-converter',
  name: 'Pinyin Converter',
  description: 'Convert Chinese characters to pinyin (tone marks, no tone, initials)',
  categoryId: 'text-tools',
  component: PinyinConverter,
  icon: <TbLanguageHiragana />,
};

export default config;
