export type SdkError = { code: string; message: string; details?: unknown };
export type SdkResult<T> = { ok: true; data?: T } | { ok: false; error: SdkError };

type ResponseMessage =
  | { type: 'devdeck:sdk:response'; requestId: string; ok: true; data?: unknown }
  | { type: 'devdeck:sdk:response'; requestId: string; ok: false; error: SdkError };

type EventMessage = { type: 'devdeck:sdk:event'; domain: string; payload?: unknown };
type ReadyAckMessage = { type: 'devdeck:plugin:ready:ack' };

const pending = new Map<string, (res: SdkResult<unknown>) => void>();
const socketListeners = new Set<(ev: unknown) => void>();

let inited = false;
let readyAcked = false;
let readyTimer: number | null = null;

function initReadyHandshake() {
  if (readyTimer !== null) return;
  const send = () => {
    if (readyAcked) return;
    window.parent.postMessage({ type: 'devdeck:plugin:ready' }, '*');
  };
  send();
  readyTimer = window.setInterval(send, 1000);
  window.setTimeout(() => {
    if (readyAcked) return;
    if (readyTimer !== null) window.clearInterval(readyTimer);
    readyTimer = null;
  }, 15000);
}

export function initSdkEvents(): void {
  if (inited) return;
  inited = true;
  window.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as unknown;
    const msg = data as ResponseMessage;
    if (msg && msg.type === 'devdeck:sdk:response') {
      const cb = pending.get(msg.requestId);
      if (!cb) return;
      pending.delete(msg.requestId);
      if (msg.ok) cb({ ok: true, data: msg.data });
      else cb({ ok: false, error: msg.error });
      return;
    }

    const ev = data as EventMessage;
    if (ev && ev.type === 'devdeck:sdk:event' && ev.domain === 'socket') {
      socketListeners.forEach((fn) => {
        try {
          fn(ev.payload);
        } catch {
          return;
        }
      });
      return;
    }

    const ack = data as ReadyAckMessage;
    if (ack && ack.type === 'devdeck:plugin:ready:ack') {
      readyAcked = true;
      if (readyTimer !== null) window.clearInterval(readyTimer);
      readyTimer = null;
    }
  });

  initReadyHandshake();
}

export function callSdk<T = unknown>(method: string, params?: unknown, timeoutMs = 15000): Promise<SdkResult<T>> {
  initSdkEvents();
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

export const sdk = {
  storage: {
    get: (key: string) => callSdk('storage.get', { key }),
    set: (key: string, value: unknown) => callSdk('storage.set', { key, value }),
    delete: (key: string) => callSdk('storage.delete', { key }),
    list: (prefix?: string) => callSdk<string[]>('storage.list', { prefix }),
    clear: () => callSdk('storage.clear'),
  },
  log: {
    debug: (message: string, data?: unknown) => callSdk('log.debug', { message, data }),
    info: (message: string, data?: unknown) => callSdk('log.info', { message, data }),
    warn: (message: string, data?: unknown) => callSdk('log.warn', { message, data }),
    error: (message: string, data?: unknown) => callSdk('log.error', { message, data }),
  },
  socket: {
    serverStart: (params: unknown) => callSdk('socket.serverStart', params),
    serverStop: () => callSdk('socket.serverStop'),
    serverStatus: () => callSdk('socket.serverStatus'),
    serverSend: (params: unknown) => callSdk('socket.serverSend', params),
    serverKick: (params: unknown) => callSdk('socket.serverKick', params),
    clientConnect: (params: unknown) => callSdk('socket.clientConnect', params),
    clientDisconnect: () => callSdk('socket.clientDisconnect'),
    clientStatus: () => callSdk('socket.clientStatus'),
    clientSend: (params: unknown) => callSdk('socket.clientSend', params),
    onEvent: (cb: (ev: unknown) => void) => {
      socketListeners.add(cb);
      return () => {
        socketListeners.delete(cb);
      };
    },
  },
};
