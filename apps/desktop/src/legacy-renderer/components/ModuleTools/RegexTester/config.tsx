// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import RegexTester from './index';
import { VscRegex } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-regex',
  name: 'Regex Tester',
  description: 'Test regular expressions and generate code snippets',
  categoryId: 'text-tools',
  component: RegexTester,
  icon: <VscRegex />,
};

export default config;
