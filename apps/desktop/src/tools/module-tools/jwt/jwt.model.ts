/** JWT decoding. This tool never verifies signatures — it must not be used as
 * an authorization check. The UI labels it "decode only". */

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: string;
  expiresAt: number | null;
  issuedAt: number | null;
  notBefore: number | null;
  status: 'valid' | 'expired' | 'not-yet-valid' | 'no-expiry';
}

export type JwtResult = { ok: true; value: DecodedJwt } | { ok: false; error: string };

function decodeSegment(segment: string): string {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function numericClaim(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function decodeJwt(token: string, nowMs: number = Date.now()): JwtResult {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '');
  if (!trimmed) return { ok: false, error: 'Paste a JWT to decode' };

  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return { ok: false, error: `A JWT has 3 dot-separated segments, found ${parts.length}` };
  }

  try {
    const headerRaw = parts[0] ?? '';
    const payloadRaw = parts[1] ?? '';
    const signature = parts[2] ?? '';

    const header = JSON.parse(decodeSegment(headerRaw)) as unknown;
    const payload = JSON.parse(decodeSegment(payloadRaw)) as unknown;

    if (typeof header !== 'object' || header === null || Array.isArray(header)) {
      return { ok: false, error: 'JWT header is not a JSON object' };
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return { ok: false, error: 'JWT payload is not a JSON object' };
    }

    const exp = numericClaim((payload as Record<string, unknown>)['exp']);
    const iat = numericClaim((payload as Record<string, unknown>)['iat']);
    const nbf = numericClaim((payload as Record<string, unknown>)['nbf']);
    const nowSeconds = nowMs / 1000;

    let status: DecodedJwt['status'] = 'no-expiry';
    if (nbf !== null && nowSeconds < nbf) status = 'not-yet-valid';
    else if (exp !== null && nowSeconds >= exp) status = 'expired';
    else if (exp !== null) status = 'valid';

    return {
      ok: true,
      value: {
        header: header as Record<string, unknown>,
        payload: payload as Record<string, unknown>,
        signature,
        expiresAt: exp,
        issuedAt: iat,
        notBefore: nbf,
        status,
      },
    };
  } catch {
    return { ok: false, error: 'Segments are not valid Base64URL-encoded JSON' };
  }
}

export function formatEpoch(seconds: number | null): string {
  if (seconds === null) return '—';
  return new Date(seconds * 1000).toISOString();
}
