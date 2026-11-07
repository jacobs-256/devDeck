import { describe, expect, it } from 'vitest';
import {
  analyzeIPv4,
  formatIPv4,
  ipClass,
  ipv4ToIPv6Mapped,
  maskFromPrefix,
  minimalCoverCidr,
  parseIPv4,
  parseIPv4WithMask,
  prefixFromMask,
} from './ipv4.model';

describe('ipv4 parsing', () => {
  it('parses and formats addresses', () => {
    const value = parseIPv4('192.168.1.10');
    expect(value).not.toBeNull();
    if (value !== null) expect(formatIPv4(value)).toBe('192.168.1.10');
  });

  it('rejects malformed addresses', () => {
    for (const input of ['', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.-1', 'a.b.c.d', '01x.1.1.1']) {
      expect(parseIPv4(input)).toBeNull();
    }
  });

  it('builds netmasks and rejects non-contiguous masks', () => {
    expect(formatIPv4(maskFromPrefix(24))).toBe('255.255.255.0');
    expect(formatIPv4(maskFromPrefix(0))).toBe('0.0.0.0');
    expect(formatIPv4(maskFromPrefix(32))).toBe('255.255.255.255');
    expect(prefixFromMask(parseIPv4('255.255.255.0') ?? 0)).toBe(24);
    expect(prefixFromMask(parseIPv4('255.0.255.0') ?? 0)).toBeNull();
  });

  it('classifies addresses', () => {
    expect(ipClass(parseIPv4('10.0.0.1') ?? 0)).toBe('A');
    expect(ipClass(parseIPv4('172.16.0.1') ?? 0)).toBe('B');
    expect(ipClass(parseIPv4('192.168.1.1') ?? 0)).toBe('C');
    expect(ipClass(parseIPv4('224.0.0.1') ?? 0)).toBe('D');
  });

  it('parses prefix, netmask, and bare forms', () => {
    expect(parseIPv4WithMask('10.0.0.1/8')).toEqual({ ip: parseIPv4('10.0.0.1'), prefix: 8 });
    expect(parseIPv4WithMask('10.0.0.1 255.0.0.0')).toEqual({
      ip: parseIPv4('10.0.0.1'),
      prefix: 8,
    });
    expect(parseIPv4WithMask('10.0.0.1')).toEqual({ ip: parseIPv4('10.0.0.1'), prefix: 32 });
    expect(parseIPv4WithMask('10.0.0.1/33')).toBeNull();
  });
});

describe('ipv4 analysis', () => {
  it('analyzes a /24', () => {
    const result = analyzeIPv4('192.168.1.10/24');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.network).toBe('192.168.1.0');
    expect(result.value.broadcast).toBe('192.168.1.255');
    expect(result.value.firstHost).toBe('192.168.1.1');
    expect(result.value.lastHost).toBe('192.168.1.254');
    expect(result.value.usableHosts).toBe(254);
    expect(result.value.totalAddresses).toBe(256);
    expect(result.value.ipv6Mapped).toBe('::ffff:c0a8:010a');
  });

  it('handles /31 and /32 edge cases', () => {
    const slash31 = analyzeIPv4('10.0.0.0/31');
    expect(slash31.ok).toBe(true);
    if (slash31.ok) {
      expect(slash31.value.usableHosts).toBe(2);
      expect(slash31.value.firstHost).toBe('10.0.0.0');
      expect(slash31.value.lastHost).toBe('10.0.0.1');
    }

    const slash32 = analyzeIPv4('10.0.0.7/32');
    expect(slash32.ok).toBe(true);
    if (slash32.ok) {
      expect(slash32.value.usableHosts).toBe(1);
      expect(slash32.value.network).toBe('10.0.0.7');
      expect(slash32.value.broadcast).toBe('10.0.0.7');
    }
  });

  it('handles /0', () => {
    const result = analyzeIPv4('1.2.3.4/0');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.netmask).toBe('0.0.0.0');
      expect(result.value.totalAddresses).toBe(2 ** 32);
      expect(result.value.usableHosts).toBe(2 ** 32 - 2);
    }
  });

  it('reports invalid input', () => {
    expect(analyzeIPv4('').ok).toBe(false);
    expect(analyzeIPv4('192.168.1.10/40').ok).toBe(false);
    expect(analyzeIPv4('not an ip').ok).toBe(false);
  });
});

describe('helpers', () => {
  it('computes the minimal covering CIDR', () => {
    const start = parseIPv4('192.168.0.0') ?? 0;
    const end = parseIPv4('192.168.0.255') ?? 0;
    const cover = minimalCoverCidr(start, end);
    expect(cover.prefix).toBe(24);
    expect(formatIPv4(cover.network)).toBe('192.168.0.0');
    expect(formatIPv4(cover.broadcast)).toBe('192.168.0.255');

    const single = minimalCoverCidr(start, start);
    expect(single.prefix).toBe(32);
  });

  it('renders IPv4-mapped IPv6 addresses', () => {
    expect(ipv4ToIPv6Mapped(parseIPv4('127.0.0.1') ?? 0).short).toBe('::ffff:7f00:0001');
    expect(ipv4ToIPv6Mapped(parseIPv4('127.0.0.1') ?? 0).full).toBe(
      '0000:0000:0000:0000:0000:ffff:7f00:0001',
    );
  });
});
