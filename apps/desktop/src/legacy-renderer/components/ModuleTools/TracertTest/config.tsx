// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import TracertTest from './index';
import { VscGitMerge } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-tracert-test',
  name: 'Traceroute',
  description: 'Trace the route packets take to a destination host',
  categoryId: 'network-tools',
  component: TracertTest,
  icon: <VscGitMerge />,
};

export default config;
