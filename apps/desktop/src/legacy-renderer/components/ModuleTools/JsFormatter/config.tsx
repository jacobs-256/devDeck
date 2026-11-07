// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import JsFormatter from './index';
import { TbBrandJavascript } from 'react-icons/tb';

const config: ModuleConfig = {
  id: 'core-js-formatter',
  name: 'JavaScript Formatter',
  description: 'Minify, beautify, obfuscate, and deobfuscate JavaScript',
  categoryId: 'dev-tools',
  component: JsFormatter,
  icon: <TbBrandJavascript />,
};

export default config;
