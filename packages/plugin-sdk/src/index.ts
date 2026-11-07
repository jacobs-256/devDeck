/**
 * `@devtoolbox/plugin-sdk` — the official DevToolBox Marketplace plugin SDK.
 *
 * A plugin is a plain web app (`index.html` + JS/TS) that the host serves from
 * `plugin://localhost/<plugin-id>/`. It runs sandboxed in an iframe and talks to
 * the host only through this SDK's `postMessage` bridge. The host validates the
 * caller, the plugin's enablement, and the permission declared in
 * `manifest.json` for every single call.
 *
 * ## Quick start
 *
 * ```ts
 * import { sdk } from '@devtoolbox/plugin-sdk';
 *
 * const saved = await sdk.storage.get<string>('apiKey');
 * const response = await sdk.http.request<{ ip: string }>({ url: 'https://api.example.com/ip' });
 * if (response.ok) console.log(response.data?.ip);
 * ```
 *
 * @packageDocumentation
 */

/** SDK version implemented by this package. Keep in sync with `manifest.sdkVersion`. */
export const SDK_VERSION = '2.0';

export interface SdkError {
  code: string;
  message: string;
  details?: unknown;
}

export type SdkResult<T> = { ok: true; data?: T } | { ok: false; error: SdkError };

type ResponseMessage =
  | { type: 'devtoolbox:sdk:response'; requestId: string; ok: true; data?: unknown }
  | { type: 'devtoolbox:sdk:response'; requestId: string; ok: false; error: SdkError };

type ThemeMessage = { type: 'devtoolbox:theme'; theme: 'light' | 'dark' };

const RESPONSE_TYPE = 'devtoolbox:sdk:response';
const REQUEST_TYPE = 'devtoolbox:sdk:request';
const THEME_TYPE = 'devtoolbox:theme';

const pending = new Map<string, (result: SdkResult<unknown>) => void>();
let listenerInstalled = false;

function ensureListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data as ResponseMessage | null;
    if (!message || message.type !== RESPONSE_TYPE) return;
    const resolve = pending.get(message.requestId);
    if (!resolve) return;
    pending.delete(message.requestId);
    if (message.ok) {
      resolve({ ok: true, data: message.data });
    } else {
      resolve({ ok: false, error: message.error });
    }
  });
}

function nextRequestId(): string {
  const random = Math.random().toString(16).slice(2);
  return `${Date.now().toString(36)}_${random}`;
}

/**
 * Call a host SDK method.
 *
 * Most plugins should use the typed `sdk` namespace instead; `callSdk` exists
 * so SDK-version upgrades can add methods without breaking older type
 * definitions.
 */
export function callSdk<T = unknown>(
  method: string,
  params?: unknown,
  timeoutMs = 20_000,
): Promise<SdkResult<T>> {
  if (typeof window === 'undefined' || window.parent === window) {
    return Promise.resolve({
      ok: false,
      error: {
        code: 'not_embedded',
        message: 'DevToolBox plugins must run inside the DevToolBox host',
      },
    });
  }

  ensureListener();
  const requestId = nextRequestId();

  return new Promise<SdkResult<T>>((resolve) => {
    pending.set(requestId, (result) => resolve(result as SdkResult<T>));

    window.parent.postMessage({ type: REQUEST_TYPE, requestId, method, params }, '*');

    window.setTimeout(() => {
      const callback = pending.get(requestId);
      if (!callback) return;
      pending.delete(requestId);
      resolve({ ok: false, error: { code: 'timeout', message: `SDK call '${method}' timed out` } });
    }, timeoutMs);
  });
}

export interface HttpRequestParams {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /**
   * Optional response decoding hint. `json` parses the body as JSON even when
   * the server sends a generic content type, `text` always returns a string.
   * `arrayBuffer` is not supported over the JSON bridge.
   */
  responseType?: 'text' | 'json' | 'arrayBuffer';
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
  truncated: boolean;
  finalUrl: string;
}

export interface SystemInfo {
  platform: string;
  arch: string;
  appVersion: string;
  tauriVersion: string;
}

export interface FileFilter {
  name: string;
  extensions: string[];
}

/** A file the user approved in a native dialog. */
export interface GrantedFile {
  fileToken: string;
  name: string;
  size: number;
}

export interface FileContents {
  content: string;
  name: string;
  size: number;
  encoding: 'utf8' | 'base64';
}

export interface SshConnectOptions {
  host: string;
  port?: number;
  username: string;
  password?: string;
  /** OpenSSH private key contents (`-----BEGIN OPENSSH PRIVATE KEY-----…`). */
  privateKey?: string;
  passphrase?: string;
}

export interface SshConnectResult {
  sessionId: string;
  host: string;
  port: number;
  username: string;
  /** SHA256 fingerprint of the pinned host key. */
  fingerprint: string;
  keyType: string;
  channelId?: string;
  terminalId?: string;
}

export interface SshSessionInfo {
  sessionId: string;
  host: string;
  port: number;
  username: string;
  fingerprint: string;
  channels: number;
}

export type SshEventName = 'ready' | 'data' | 'eof' | 'closed' | 'exit' | 'error';

export interface SshEventPayload {
  pluginId: string;
  sessionId: string;
  event: SshEventName;
  channelId?: string;
  /** Base64 terminal output for `data` events. */
  data?: string;
  /** UTF-8 rendering of `data` when the chunk is valid text. */
  text?: string;
  stream?: 'stdout' | 'stderr';
  message?: string;
  code?: number;
}

export interface SftpEntry {
  name: string;
  path: string;
  kind: 'file' | 'dir' | 'symlink' | 'other';
  size: number;
  modifiedMs?: number;
}

export interface SftpFile {
  path: string;
  content: string;
  size: number;
  encoding: 'utf8' | 'base64';
}

export interface SocketOptions {
  host?: string;
  /** 0 asks the host for an ephemeral port (listen/bind only). */
  port: number;
}

export interface SocketSendOptions {
  sessionId: string;
  data: string;
  encoding?: 'utf8' | 'base64';
}

export interface ServerSendOptions extends SocketSendOptions {
  clientId: string;
}

export interface UdpSendOptions extends SocketSendOptions {
  host: string;
  port: number;
}

export type SocketEventName =
  | 'connected'
  | 'data'
  | 'closed'
  | 'error'
  | 'listening'
  | 'client-connected'
  | 'client-closed';

export interface SocketEventPayload {
  pluginId: string;
  sessionId: string;
  event: SocketEventName;
  /** Base64 payload for `data` events. */
  data?: string;
  /** UTF-8 rendering of `data` when the chunk is valid text. */
  text?: string;
  clientId?: string;
  remote?: string;
  message?: string;
}

export interface CapabilityGrant {
  pluginId: string;
  permissions: string[];
  httpDomains: string[];
  envAllowlist: string[];
  grantedAtMs: number;
}

/** Typed namespaces for every capability in the DevToolBox permission model. */
export const sdk = {
  /** `storage:kv` — host-owned key/value storage scoped to this plugin. */
  storage: {
    get: <T = unknown>(key: string) => callSdk<{ value: T | null }>('storage.get', { key }),
    set: (key: string, value: unknown) => callSdk<{ saved: boolean }>('storage.set', { key, value }),
    delete: (key: string) => callSdk<{ deleted: boolean }>('storage.delete', { key }),
    keys: () => callSdk<{ keys: string[] }>('storage.keys'),
    clear: () => callSdk<{ cleared: boolean }>('storage.clear'),
  },

  /** `http:proxy` / `http:external` — host-checked against `manifest.httpDomains`. */
  http: {
    request: <T = unknown>(params: HttpRequestParams) => callSdk<HttpResponse<T>>('http.request', params),
  },

  /** `log:write` — appears in the host's rotating plugin log. */
  log: {
    write: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) =>
      callSdk<{ logged: boolean }>('log.write', { level, message, data }),
    info: (message: string, data?: unknown) => sdk.log.write('info', message, data),
    warn: (message: string, data?: unknown) => sdk.log.write('warn', message, data),
    error: (message: string, data?: unknown) => sdk.log.write('error', message, data),
  },

  /** `system:*` capabilities. */
  system: {
    openExternal: (url: string) => callSdk<{ opened: boolean }>('system.openExternal', { url }),
    getInfo: () => callSdk<SystemInfo>('system.getInfo'),
  },

  /** `theme:read` — the host's current theme. */
  theme: {
    get: () => callSdk<{ theme: 'light' | 'dark' }>('theme.get'),
  },

  /**
   * `fs:dialog` + `fs:read`/`fs:write` — files the user explicitly selected.
   *
   * Paths never reach the plugin; the host returns opaque tokens bound to the
   * plugin that requested them.
   */
  fs: {
    pickFile: (options?: { title?: string; filters?: FileFilter[]; multiple?: boolean }) =>
      callSdk<{ items: GrantedFile[] }>('fs.pickFile', options ?? {}),
    pickSaveFile: (options?: { title?: string; suggestedName?: string; filters?: FileFilter[] }) =>
      callSdk<GrantedFile | null>('fs.pickSaveFile', options ?? {}),
    readFile: (options: { fileToken: string; encoding?: 'utf8' | 'base64' }) =>
      callSdk<FileContents>('fs.readFile', options),
    writeFile: (options: { fileToken: string; content: string; encoding?: 'utf8' | 'base64' }) =>
      callSdk<{ written: number }>('fs.writeFile', options),
    readPluginData: (options: { path: string; encoding?: 'utf8' | 'base64' }) =>
      callSdk<FileContents>('fs.readPluginData', options),
    writePluginData: (options: { path: string; content: string; encoding?: 'utf8' | 'base64' }) =>
      callSdk<{ written: number }>('fs.writePluginData', options),
  },

  /**
   * `net:ssh` — SSH terminals and SFTP. Host keys are pinned on first use, and
   * terminal output arrives through {@link onSshEvent}.
   */
  ssh: {
    connect: (options: SshConnectOptions) => callSdk<SshConnectResult>('ssh.connect', options),
    openShell: (options: { sessionId: string; cols?: number; rows?: number; term?: string }) =>
      callSdk<{ sessionId: string; channelId: string }>('ssh.openShell', options),
    exec: (options: { sessionId: string; command: string }) =>
      callSdk<{ sessionId: string; channelId: string }>('ssh.exec', options),
    write: (options: { sessionId: string; channelId: string; data: string; encoding?: 'utf8' | 'base64' }) =>
      callSdk<{ written: boolean }>('ssh.write', options),
    resize: (options: { sessionId: string; channelId: string; cols: number; rows: number }) =>
      callSdk<{ resized: boolean }>('ssh.resize', options),
    closeChannel: (sessionId: string, channelId: string) =>
      callSdk<{ closed: boolean }>('ssh.closeChannel', { sessionId, channelId }),
    disconnect: (sessionId: string) => callSdk<{ disconnected: boolean }>('ssh.disconnect', { sessionId }),
    list: () => callSdk<{ sessions: SshSessionInfo[] }>('ssh.list'),
    forgetHost: (host: string, port = 22) => callSdk<{ removed: boolean }>('ssh.forgetHost', { host, port }),
  },

  /** `net:ssh` — SFTP operations on an SSH session. */
  sftp: {
    list: (options: { sessionId: string; path: string }) =>
      callSdk<{ items: SftpEntry[] }>('sftp.list', options),
    read: (options: { sessionId: string; path: string; encoding?: 'utf8' | 'base64' }) =>
      callSdk<SftpFile>('sftp.read', options),
    write: (options: { sessionId: string; path: string; content: string; encoding?: 'utf8' | 'base64' }) =>
      callSdk<{ written: number }>('sftp.write', options),
    mkdir: (options: { sessionId: string; path: string }) => callSdk<{ ok: boolean }>('sftp.mkdir', options),
    remove: (options: { sessionId: string; path: string; directory?: boolean }) =>
      callSdk<{ ok: boolean }>('sftp.remove', options),
    rename: (options: { sessionId: string; from: string; to: string }) =>
      callSdk<{ ok: boolean }>('sftp.rename', options),
    realpath: (options: { sessionId: string; path: string }) =>
      callSdk<{ path: string }>('sftp.realpath', options),
  },

  /**
   * `net:socket` — raw TCP/UDP sessions owned by the host.
   *
   * Data is Base64 on the wire; UTF-8 text is available as `text` on events.
   * Events arrive through {@link onSocketEvent}.
   */
  socket: {
    tcpConnect: (options: SocketOptions) => callSdk<{ sessionId: string }>('socket.tcpConnect', options),
    tcpSend: (options: SocketSendOptions) =>
      callSdk<{ sent: boolean; sessionId: string }>('socket.tcpSend', options),
    tcpClose: (sessionId: string) => callSdk<{ closed: boolean }>('socket.tcpClose', { sessionId }),
    tcpListen: (options: SocketOptions) =>
      callSdk<{ sessionId: string; port: number }>('socket.tcpListen', options),
    serverSend: (options: ServerSendOptions) => callSdk<{ sent: boolean }>('socket.serverSend', options),
    serverKick: (sessionId: string, clientId: string) =>
      callSdk<{ kicked: boolean }>('socket.serverKick', { sessionId, clientId }),
    udpBind: (options: SocketOptions) =>
      callSdk<{ sessionId: string; port: number }>('socket.udpBind', options),
    udpSend: (options: UdpSendOptions) => callSdk<{ sent: number }>('socket.udpSend', options),
    close: (sessionId: string) => callSdk<{ closed: boolean }>('socket.close', { sessionId }),
    list: () => callSdk<{ sessions: string[] }>('socket.list'),
  },

  /** Always available: introspect the grant the host issued for this plugin. */
  capabilities: {
    list: () => callSdk<{ grant: CapabilityGrant | null }>('capability.list'),
  },
};

/**
 * Apply the host theme to the plugin document and keep it in sync.
 *
 * Uses `data-theme` on `<html>`, matching the host's CSS convention. Call once
 * during startup; returns an unsubscribe function.
 */
export function followHostTheme(onChange?: (theme: 'light' | 'dark') => void): () => void {
  const apply = (theme: 'light' | 'dark') => {
    document.documentElement.dataset.theme = theme;
    onChange?.(theme);
  };

  const initial = new URLSearchParams(window.location.search).get('theme');
  apply(initial === 'light' ? 'light' : 'dark');

  const listener = (event: MessageEvent) => {
    const message = event.data as ThemeMessage | null;
    if (!message || message.type !== THEME_TYPE) return;
    apply(message.theme === 'light' ? 'light' : 'dark');
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/**
 * Subscribe to socket events pushed by the host.
 *
 * ```ts
 * const stop = onSocketEvent((event) => {
 *   if (event.event === 'data') console.log(event.text ?? event.data);
 * });
 * // later: stop();
 * ```
 */
export function onSocketEvent(handler: (event: SocketEventPayload) => void): () => void {
  const listener = (message: MessageEvent) => {
    const data = message.data as { type?: string; event?: string; payload?: SocketEventPayload } | null;
    if (!data || data.type !== 'devtoolbox:event' || data.event !== 'socket') return;
    if (!data.payload) return;
    handler(data.payload);
  };

  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/** Decode a socket event payload into raw bytes. */
export function socketEventBytes(payload: SocketEventPayload): Uint8Array {
  const binary = atob(payload.data ?? '');
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Subscribe to SSH terminal / status events pushed by the host. */
export function onSshEvent(handler: (event: SshEventPayload) => void): () => void {
  const listener = (message: MessageEvent) => {
    const data = message.data as { type?: string; event?: string; payload?: SshEventPayload } | null;
    if (!data || data.type !== 'devtoolbox:event' || data.event !== 'ssh') return;
    if (!data.payload) return;
    handler(data.payload);
  };

  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}
