// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import TextDiff from './index';
import { VscDiff } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-diff',
  name: 'Text Diff',
  description: 'Compare text differences and highlight changes',
  categoryId: 'text-tools',
  component: TextDiff,
  icon: <VscDiff />,
};

export default config;
