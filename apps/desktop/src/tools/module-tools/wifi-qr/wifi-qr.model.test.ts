import { describe, expect, it } from 'vitest';
import { escapeWifiValue, wifiQrPayload } from './wifi-qr.model';

describe('wifi qr payload', () => {
  it('builds a WPA payload', () => {
    expect(wifiQrPayload({ ssid: 'MyNet', password: 'secret', security: 'WPA' })).toBe(
      'WIFI:T:WPA;S:MyNet;P:secret;;',
    );
  });

  it('omits the password for open networks', () => {
    expect(wifiQrPayload({ ssid: 'Cafe', security: 'nopass' })).toBe('WIFI:T:nopass;S:Cafe;;');
  });

  it('marks hidden networks', () => {
    expect(wifiQrPayload({ ssid: 'Net', password: 'x', security: 'WEP', hidden: true })).toBe(
      'WIFI:T:WEP;S:Net;P:x;H:true;;',
    );
  });

  it('escapes reserved characters', () => {
    expect(escapeWifiValue('a;b,c:d"e\\f')).toBe('a\\;b\\,c\\:d\\"e\\\\f');
    expect(wifiQrPayload({ ssid: 'a;b', password: 'p:w', security: 'WPA' })).toBe(
      'WIFI:T:WPA;S:a\\;b;P:p\\:w;;',
    );
  });
});
