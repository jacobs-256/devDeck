// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import CertViewer from './index';
import { VscFileBinary } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-cert-viewer',
  name: 'Certificate Viewer',
  description: 'View certificate details',
  categoryId: 'security-tools',
  component: CertViewer,
  icon: <VscFileBinary />,
};

export default config;
