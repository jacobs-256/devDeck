export type SdkError = { code: string; message: string; details?: unknown };
export type SdkResult<T> = { ok: true; data?: T } | { ok: false; error: SdkError };

type ResponseMessage =
  | { type: 'devdeck:sdk:response'; requestId: string; ok: true; data?: unknown }
  | { type: 'devdeck:sdk:response'; requestId: string; ok: false; error: SdkError };

const pending = new Map<string, (res: SdkResult<unknown>) => void>();

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as ResponseMessage;
  if (!msg || msg.type !== 'devdeck:sdk:response') return;
  const cb = pending.get(msg.requestId);
  if (!cb) return;
  pending.delete(msg.requestId);
  if (msg.ok) cb({ ok: true, data: msg.data });
  else cb({ ok: false, error: msg.error });
});

export function callSdk<T = unknown>(method: string, params?: unknown, timeoutMs = 15000): Promise<SdkResult<T>> {
  const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const payload = { type: 'devdeck:sdk:request', requestId, method, params };
  window.parent.postMessage(payload, '*');
  return new Promise((resolve) => {
    pending.set(requestId, (res) => resolve(res as SdkResult<T>));
    window.setTimeout(() => {
      const cb = pending.get(requestId);
      if (!cb) return;
      pending.delete(requestId);
      resolve({ ok: false, error: { code: 'timeout', message: 'SDK request timeout' } });
    }, timeoutMs);
  });
}

export type HttpRequestParams = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  responseType?: 'text' | 'json' | 'arrayBuffer';
};

export type HttpResponse<T = unknown> = { status: number; headers: Record<string, string>; data: T };

export const sdk = {
  http: {
    request: <T = unknown>(params: HttpRequestParams) => callSdk<HttpResponse<T>>('http.request', params),
  },
  storage: {
    get: (key: string) => callSdk('storage.get', { key }),
    set: (key: string, value: unknown) => callSdk('storage.set', { key, value }),
  },
  log: {
    info: (message: string, data?: unknown) => callSdk('log.info', { message, data }),
    warn: (message: string, data?: unknown) => callSdk('log.warn', { message, data }),
    error: (message: string, data?: unknown) => callSdk('log.error', { message, data }),
  },
};
