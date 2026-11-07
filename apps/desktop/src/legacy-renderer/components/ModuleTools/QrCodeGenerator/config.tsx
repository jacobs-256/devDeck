// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import QrCodeGenerator from './index';
import { TbQrcode } from 'react-icons/tb';

const config: ModuleConfig = {
  id: 'core-qrcode',
  name: 'QR Code Generator',
  description: 'Generate QR codes with custom colors, logo, and error correction',
  categoryId: 'text-tools',
  component: QrCodeGenerator,
  icon: <TbQrcode />,
};

export default config;
