// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import ClientCertGenerator from './index';
import { VscKey } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-client-cert-generator',
  name: 'Client Certificate',
  description: 'Issue client certificates signed by a CA',
  categoryId: 'security-tools',
  component: ClientCertGenerator,
  icon: <VscKey />,
};

export default config;
