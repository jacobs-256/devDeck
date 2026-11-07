// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import UuidGenerator from './index';
import { VscKey } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-uuid',
  name: 'UUID Generator',
  description: 'Generate UUIDs (v1/v3/v4/v5)',
  categoryId: 'dev-tools',
  component: UuidGenerator,
  icon: <VscKey />,
};

export default config;
