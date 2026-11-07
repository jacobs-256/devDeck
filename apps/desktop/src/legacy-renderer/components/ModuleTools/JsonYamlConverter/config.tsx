// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import JsonYamlConverter from './index';
import { VscSymbolString } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-json-yaml',
  name: 'JSON ⇄ YAML',
  description: 'Convert JSON and YAML with syntax highlighting',
  categoryId: 'text-tools',
  component: JsonYamlConverter,
  icon: <VscSymbolString />,
};

export default config;
