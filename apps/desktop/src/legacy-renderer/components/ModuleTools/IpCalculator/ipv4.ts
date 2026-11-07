// @ts-nocheck
export function parseIPv4(input: string): number | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => {
    if (p.length === 0) return NaN;
    if (!/^\d+$/.test(p)) return NaN;
    const n = Number(p);
    if (!Number.isFinite(n)) return NaN;
    if (n < 0 || n > 255) return NaN;
    return n;
  });
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [a, b, c, d] = nums;
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

export function formatIPv4(num: number): string {
  const n = num >>> 0;
  const a = (n >>> 24) & 0xff;
  const b = (n >>> 16) & 0xff;
  const c = (n >>> 8) & 0xff;
  const d = n & 0xff;
  return `${a}.${b}.${c}.${d}`;
}

export function maskFromPrefix(prefix: number): number {
  const p = Math.max(0, Math.min(32, Math.floor(prefix)));
  if (p === 0) return 0;
  if (p === 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - p)) >>> 0;
}

export function binaryIPv4(num: number, dotted: boolean): string {
  const n = num >>> 0;
  const s = n.toString(2).padStart(32, '0');
  if (!dotted) return s;
  return `${s.slice(0, 8)}.${s.slice(8, 16)}.${s.slice(16, 24)}.${s.slice(24)}`;
}

export function ipClass(ip: number): string {
  const a = (ip >>> 24) & 0xff;
  if (a >= 1 && a <= 126) return 'A';
  if (a >= 128 && a <= 191) return 'B';
  if (a >= 192 && a <= 223) return 'C';
  if (a >= 224 && a <= 239) return 'D';
  if (a >= 240 && a <= 254) return 'E';
  return '-';
}

export function parseIPv4WithMask(input: string): { ip: number; prefix: number } | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;

  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  const first = parts[0] ?? '';
  if (first.includes('/')) {
    const [ipStr, prefixStr] = first.split('/');
    const ip = parseIPv4(ipStr);
    const prefix = Number(prefixStr);
    if (ip === null) return null;
    if (!Number.isFinite(prefix)) return null;
    if (prefix < 0 || prefix > 32) return null;
    return { ip, prefix: Math.floor(prefix) };
  }

  const ip = parseIPv4(first);
  if (ip === null) return null;

  if (parts.length >= 2) {
    const mask = parseIPv4(parts[1] ?? '');
    if (mask === null) return null;
    const prefix = prefixFromMask(mask);
    if (prefix === null) return null;
    return { ip, prefix };
  }

  return { ip, prefix: 32 };
}

export function prefixFromMask(mask: number): number | null {
  const m = mask >>> 0;
  let seenZero = false;
  let prefix = 0;
  for (let i = 31; i >= 0; i--) {
    const bit = (m >>> i) & 1;
    if (bit === 1) {
      if (seenZero) return null;
      prefix++;
    } else {
      seenZero = true;
    }
  }
  return prefix;
}

export function minimalCoverCidr(
  start: number,
  end: number,
): { prefix: number; network: number; broadcast: number } {
  const s = start >>> 0;
  const e = end >>> 0;
  const x = (s ^ e) >>> 0;
  const prefix = x === 0 ? 32 : Math.clz32(x);
  const mask = maskFromPrefix(prefix);
  const network = (s & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  return { prefix, network, broadcast };
}

export function ipv4ToIPv6Mapped(ip: number): { full: string; short: string } {
  const n = ip >>> 0;
  const hi = ((n >>> 16) & 0xffff).toString(16).padStart(4, '0');
  const lo = (n & 0xffff).toString(16).padStart(4, '0');
  const full = `0000:0000:0000:0000:0000:ffff:${hi}:${lo}`;
  const short = `::ffff:${hi}:${lo}`;
  return { full, short };
}
