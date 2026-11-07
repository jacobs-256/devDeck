// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import JsonXmlConverter from './index';
import { VscSymbolString } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-json-xml',
  name: 'JSON ⇄ XML',
  description: 'Convert JSON and XML with syntax highlighting',
  categoryId: 'text-tools',
  component: JsonXmlConverter,
  icon: <VscSymbolString />,
};

export default config;
