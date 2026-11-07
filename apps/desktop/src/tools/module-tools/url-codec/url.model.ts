/** URL percent-encoding helpers. */

export type DecodeResult = { ok: true; value: string } | { ok: false; error: string };

/** `encodeURIComponent`: escapes everything except `A-Za-z0-9-_.!~*'()`. */
export function encodeComponent(input: string): string {
  return encodeURIComponent(input);
}

/** `encodeURI`: keeps URL structure characters intact. */
export function encodeUri(input: string): string {
  return encodeURI(input);
}

export function decodeComponent(input: string): DecodeResult {
  try {
    return { ok: true, value: decodeURIComponent(input) };
  } catch {
    return { ok: false, error: 'Malformed percent-encoding (for example "%ZZ")' };
  }
}

export function decodeUri(input: string): DecodeResult {
  try {
    return { ok: true, value: decodeURI(input) };
  } catch {
    return { ok: false, error: 'Malformed percent-encoding (for example "%ZZ")' };
  }
}

export interface QueryPair {
  key: string;
  value: string;
}

/** Parse a query string (with or without a leading `?`) without throwing. */
export function parseQuery(input: string): QueryPair[] {
  const query = input.trim().replace(/^\?/, '');
  if (!query) return [];

  return query.split('&').map((segment) => {
    const [rawKey = '', ...rest] = segment.split('=');
    const rawValue = rest.join('=');
    return {
      key: safeDecode(rawKey.replace(/\+/g, ' ')),
      value: safeDecode(rawValue.replace(/\+/g, ' ')),
    };
  });
}

function safeDecode(value: string): string {
  const decoded = decodeComponent(value);
  return decoded.ok ? decoded.value : value;
}

/** Build a query string from pairs, skipping empty keys. */
export function buildQuery(pairs: QueryPair[]): string {
  return pairs
    .filter((pair) => pair.key.trim() !== '')
    .map((pair) => `${encodeURIComponent(pair.key)}=${encodeURIComponent(pair.value)}`)
    .join('&');
}
