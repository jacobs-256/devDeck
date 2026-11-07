// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import PingTest from './index';
import { VscRadioTower } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-ping-test',
  name: 'Ping Test',
  description: 'Test host reachability and latency',
  categoryId: 'network-tools',
  component: PingTest,
  icon: <VscRadioTower />,
};

export default config;
