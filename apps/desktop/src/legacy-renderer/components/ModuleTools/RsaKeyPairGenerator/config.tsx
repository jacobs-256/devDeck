// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import RsaKeyPairGenerator from './index';
import { VscKey } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-rsa-keypair-generator',
  name: 'RSA Key Pair',
  description: 'Generate RSA public/private key pair (PEM)',
  categoryId: 'security-tools',
  component: RsaKeyPairGenerator,
  icon: <VscKey />,
};

export default config;
