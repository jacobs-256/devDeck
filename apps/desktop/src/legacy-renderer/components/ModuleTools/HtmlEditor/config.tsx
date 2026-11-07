// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import HtmlEditor from './index';
import { VscCode } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-html-editor',
  name: 'HTML Editor',
  description: 'Edit HTML with live preview',
  categoryId: 'dev-tools',
  component: HtmlEditor,
  icon: <VscCode />,
};

export default config;
