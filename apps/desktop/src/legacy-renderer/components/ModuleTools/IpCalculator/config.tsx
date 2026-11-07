// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import IpCalculator from './index';
import { VscGlobe } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-ip-calculator',
  name: 'IP Calculator',
  description: 'IPv4 subnet calculator, converter, and range expander',
  categoryId: 'network-tools',
  component: IpCalculator,
  icon: <VscGlobe />,
};

export default config;
