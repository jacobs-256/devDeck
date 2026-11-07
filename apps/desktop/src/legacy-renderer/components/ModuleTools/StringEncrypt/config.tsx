// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import StringEncrypt from './index';
import { TbShieldLock } from 'react-icons/tb';

const config: ModuleConfig = {
  id: 'core-string-encrypt',
  name: 'String Crypto',
  description: 'Batch hashing and encryption for common algorithms',
  categoryId: 'security-tools',
  component: StringEncrypt,
  icon: <TbShieldLock />,
};

export default config;
