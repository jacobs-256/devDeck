// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import UrlCodec from './index';
import { VscLink } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-url-encode',
  name: 'URL Encoder/Decoder',
  description: 'Encode and decode URL components',
  categoryId: 'text-tools',
  component: UrlCodec,
  icon: <VscLink />,
};

export default config;
