// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import JwtTool from './index';
import { TbKey } from 'react-icons/tb';

const config: ModuleConfig = {
  id: 'core-jwt-tool',
  name: 'JWT Tool',
  description: 'Parse, verify, and generate JWTs',
  categoryId: 'security-tools',
  component: JwtTool,
  icon: <TbKey />,
};

export default config;
