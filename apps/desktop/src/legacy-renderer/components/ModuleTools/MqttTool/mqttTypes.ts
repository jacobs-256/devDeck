// @ts-nocheck
export interface MqttConfig {
  id: string;
  name: string;
  groupId?: string;
  protocol: 'mqtt://' | 'mqtts://' | 'ws://' | 'wss://';
  host: string;
  port: number;
  path: string;
  clientId: string;
  username: string;
  password: string;
  sslEnabled: boolean;
  sslSecure: boolean;
  alpn: string;
  certType: 'ca-signed' | 'self-signed';
  caFile: string;
  clientCert: string;
  clientKey: string;
  caFileToken?: string;
  clientCertToken?: string;
  clientKeyToken?: string;
  caPem?: string;
  clientCertPem?: string;
  clientKeyPem?: string;
  caDataB64?: string;
  clientCertDataB64?: string;
  clientKeyDataB64?: string;
  mqttVersion: '3.1' | '3.1.1' | '5.0';
  connectTimeout: number;
  keepAlive: number;
  autoReconnect: boolean;
  reconnectPeriod: number;
  cleanStart: boolean;
  sessionExpiry: number;
  lastWillTopic: string;
  lastWillQos: 0 | 1 | 2;
  lastWillRetain: boolean;
  lastWillMessage: string;
  lastWillFormat: 'plaintext' | 'json';
}

export interface MqttGroup {
  id: string;
  name: string;
}

export function getDefaultMqttConfig(): MqttConfig {
  return {
    id: `mqtt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    protocol: 'mqtts://',
    host: '',
    port: 8883,
    path: '/mqtt',
    clientId: `devdeck_${Math.random().toString(16).slice(2, 10)}`,
    username: '',
    password: '',
    sslEnabled: true,
    sslSecure: true,
    alpn: '',
    certType: 'ca-signed',
    caFile: '',
    clientCert: '',
    clientKey: '',
    caPem: undefined,
    clientCertPem: undefined,
    clientKeyPem: undefined,
    caDataB64: undefined,
    clientCertDataB64: undefined,
    clientKeyDataB64: undefined,
    mqttVersion: '3.1.1',
    connectTimeout: 10,
    keepAlive: 60,
    autoReconnect: true,
    reconnectPeriod: 4000,
    cleanStart: true,
    sessionExpiry: 0,
    lastWillTopic: '',
    lastWillQos: 0,
    lastWillRetain: false,
    lastWillMessage: '',
    lastWillFormat: 'plaintext',
  };
}
