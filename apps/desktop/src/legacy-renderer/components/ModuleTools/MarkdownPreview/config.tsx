// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import MarkdownPreview from './index';
import { VscMarkdown } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-markdown',
  name: 'Markdown Preview',
  description: 'Markdown editing with live preview',
  categoryId: 'text-tools',
  component: MarkdownPreview,
  icon: <VscMarkdown />,
};

export default config;
