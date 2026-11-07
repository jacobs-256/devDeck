// @ts-nocheck
import type { ModuleConfig } from '../../../types';
import MqttTool from './index';
import { VscGlobe } from 'react-icons/vsc';

const config: ModuleConfig = {
  id: 'core-mqtt-tool',
  name: 'MQTT Tools',
  description: 'Connect to an MQTT broker (mqtt/mqtts/ws/wss), subscribe, publish, and inspect messages',
  categoryId: 'network-tools',
  component: MqttTool,
  icon: <VscGlobe />,
};

export default config;
