// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import JsonFormatter from './index';
import { VscJson } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-json-formatter',
  name: 'JSON Formatter',
  description: 'Format, minify, validate, and view JSON as a tree',
  categoryId: 'text-tools',
  component: JsonFormatter,
  icon: <VscJson />,
};

export default config;
