// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import WifiQrGenerator from './index';
import { TbWifi } from 'react-icons/tb';

const config: ModuleConfig = {
  id: 'core-wifi-qrcode',
  name: 'WiFi QR Generator',
  description: 'Generate WiFi QR codes for easy network connection',
  categoryId: 'text-tools',
  component: WifiQrGenerator,
  icon: <TbWifi />,
};

export default config;
