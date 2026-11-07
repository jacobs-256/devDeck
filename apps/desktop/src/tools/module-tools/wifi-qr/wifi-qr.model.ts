/** Wi-Fi QR payload formatting (WIFI:T:…;S:…;P:…;;). */

export type WifiSecurity = 'WPA' | 'WEP' | 'nopass';

export interface WifiConfig {
  ssid: string;
  password?: string;
  security: WifiSecurity;
  hidden?: boolean;
}

/** Escape `\ ; , : "` as required by the Wi-Fi QR convention. */
export function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

export function wifiQrPayload(config: WifiConfig): string {
  const parts = [`T:${config.security}`, `S:${escapeWifiValue(config.ssid)}`];

  if (config.security !== 'nopass') {
    parts.push(`P:${escapeWifiValue(config.password ?? '')}`);
  }
  if (config.hidden) {
    parts.push('H:true');
  }

  return `WIFI:${parts.join(';')};;`;
}
