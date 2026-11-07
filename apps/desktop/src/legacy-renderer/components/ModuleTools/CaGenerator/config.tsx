// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import CaGenerator from './index';
import { VscShield } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-ca-generator',
  name: 'CA Generator',
  description: 'Generate a self-signed CA root certificate and private key',
  categoryId: 'security-tools',
  component: CaGenerator,
  icon: <VscShield />,
};

export default config;
