// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import CsrGenerator from './index';
import { VscNewFile } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-csr-generator',
  name: 'CSR Generator',
  description: 'Generate a private key and a certificate signing request (CSR)',
  categoryId: 'security-tools',
  component: CsrGenerator,
  icon: <VscNewFile />,
};

export default config;
