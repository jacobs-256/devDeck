// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import UnicodeTool from './index';
import { TbLetterU } from 'react-icons/tb';

const config: ModuleConfig = {
  id: 'core-unicode-tool',
  name: 'Unicode Tool',
  description: 'Encode and decode Unicode formats',
  categoryId: 'text-tools',
  component: UnicodeTool,
  icon: <TbLetterU />,
};

export default config;
