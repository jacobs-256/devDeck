// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import Base64Codec from './index';
import { VscLock } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-base64',
  name: 'Base64 Encoder/Decoder',
  description: 'Encode and decode Base64 strings',
  categoryId: 'text-tools',
  component: Base64Codec,
  icon: <VscLock />,
};

export default config;
