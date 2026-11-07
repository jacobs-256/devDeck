/** WebSocket URL validation and message rendering helpers. */

export type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

export function validateWsUrl(raw: string): UrlCheck {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: 'Enter a WebSocket URL' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }

  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    return { ok: false, error: 'URL must start with ws:// or wss://' };
  }

  return { ok: true, url: url.toString() };
}

export function describeData(data: string | ArrayBuffer | ArrayBufferView): string {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
  return new TextDecoder().decode(data);
}
