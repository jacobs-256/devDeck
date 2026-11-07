/** IPv4 / CIDR math, ported from the Electron implementation with tests. */

export function parseIPv4(input: string): number | null {
  const value = input.trim();
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (part.length === 0 || !/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (!Number.isFinite(octet) || octet < 0 || octet > 255) return null;
    octets.push(octet);
  }

  const [a = 0, b = 0, c = 0, d = 0] = octets;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

export function formatIPv4(value: number): string {
  const n = value >>> 0;
  return `${(n >>> 24) & 0xff}.${(n >>> 16) & 0xff}.${(n >>> 8) & 0xff}.${n & 0xff}`;
}

export function maskFromPrefix(prefix: number): number {
  const p = Math.max(0, Math.min(32, Math.floor(prefix)));
  if (p === 0) return 0;
  if (p === 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - p)) >>> 0;
}

export function prefixFromMask(mask: number): number | null {
  const m = mask >>> 0;
  let prefix = 0;
  let seenZero = false;
  for (let bit = 31; bit >= 0; bit -= 1) {
    const set = (m >>> bit) & 1;
    if (set === 1) {
      if (seenZero) return null;
      prefix += 1;
    } else {
      seenZero = true;
    }
  }
  return prefix;
}

export function binaryIPv4(value: number, dotted = true): string {
  const bits = (value >>> 0).toString(2).padStart(32, '0');
  if (!dotted) return bits;
  return `${bits.slice(0, 8)}.${bits.slice(8, 16)}.${bits.slice(16, 24)}.${bits.slice(24)}`;
}

export function ipClass(value: number): string {
  const first = (value >>> 24) & 0xff;
  if (first >= 1 && first <= 126) return 'A';
  if (first >= 128 && first <= 191) return 'B';
  if (first >= 192 && first <= 223) return 'C';
  if (first >= 224 && first <= 239) return 'D';
  if (first >= 240 && first <= 254) return 'E';
  return '—';
}

export function parseIPv4WithMask(input: string): { ip: number; prefix: number } | null {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? '';
  if (!first) return null;

  if (first.includes('/')) {
    const [addressPart = '', prefixPart = ''] = first.split('/');
    const ip = parseIPv4(addressPart);
    if (ip === null || !/^\d+$/.test(prefixPart)) return null;
    const prefix = Number(prefixPart);
    if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return null;
    return { ip, prefix: Math.floor(prefix) };
  }

  const ip = parseIPv4(first);
  if (ip === null) return null;

  const maskPart = parts[1];
  if (maskPart !== undefined) {
    const mask = parseIPv4(maskPart);
    if (mask === null) return null;
    const prefix = prefixFromMask(mask);
    if (prefix === null) return null;
    return { ip, prefix };
  }

  return { ip, prefix: 32 };
}

export function minimalCoverCidr(
  start: number,
  end: number,
): { prefix: number; network: number; broadcast: number } {
  const s = start >>> 0;
  const e = end >>> 0;
  const differentBits = (s ^ e) >>> 0;
  const prefix = differentBits === 0 ? 32 : Math.clz32(differentBits);
  const mask = maskFromPrefix(prefix);
  const network = (s & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { prefix, network, broadcast };
}

export function ipv4ToIPv6Mapped(value: number): { full: string; short: string } {
  const n = value >>> 0;
  const high = ((n >>> 16) & 0xffff).toString(16).padStart(4, '0');
  const low = (n & 0xffff).toString(16).padStart(4, '0');
  return {
    full: `0000:0000:0000:0000:0000:ffff:${high}:${low}`,
    short: `::ffff:${high}:${low}`,
  };
}

export interface IpAnalysis {
  address: string;
  prefix: number;
  netmask: string;
  wildcard: string;
  network: string;
  broadcast: string;
  firstHost: string;
  lastHost: string;
  totalAddresses: number;
  usableHosts: number;
  classLabel: string;
  binary: string;
  ipv6Mapped: string;
}

export type IpResult = { ok: true; value: IpAnalysis } | { ok: false; error: string };

export function analyzeIPv4(input: string): IpResult {
  if (!input.trim()) {
    return { ok: false, error: 'Enter an IPv4 address, for example 192.168.1.10/24' };
  }
  const parsed = parseIPv4WithMask(input);
  if (!parsed) {
    return {
      ok: false,
      error: 'Invalid IPv4 input. Use 10.0.0.1/24, 10.0.0.1 255.255.255.0, or a bare address.',
    };
  }

  const { ip, prefix } = parsed;
  const mask = maskFromPrefix(prefix);
  const wildcard = (~mask >>> 0) >>> 0;
  const network = (ip & mask) >>> 0;
  const broadcast = (network | wildcard) >>> 0;
  const totalAddresses = 2 ** (32 - prefix);
  const usableHosts = prefix >= 31 ? totalAddresses : totalAddresses - 2;
  const firstHost = totalAddresses <= 2 ? network : network + 1;
  const lastHost = totalAddresses <= 2 ? broadcast : broadcast - 1;

  return {
    ok: true,
    value: {
      address: formatIPv4(ip),
      prefix,
      netmask: formatIPv4(mask),
      wildcard: formatIPv4(wildcard),
      network: formatIPv4(network),
      broadcast: formatIPv4(broadcast),
      firstHost: formatIPv4(firstHost),
      lastHost: formatIPv4(lastHost),
      totalAddresses,
      usableHosts,
      classLabel: ipClass(ip),
      binary: binaryIPv4(ip),
      ipv6Mapped: ipv4ToIPv6Mapped(ip).short,
    },
  };
}
