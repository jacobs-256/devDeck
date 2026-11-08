# Plugin SDK Reference (2.0)

The SDK is published as `@devdeck/plugin-sdk`. Plugins import typed helpers
instead of talking to the host directly. The host gates every call with the
plugin's manifest permissions.

```bash
pnpm add @devdeck/plugin-sdk@2
```

```ts
import { sdk, followHostTheme, onSocketEvent } from '@devdeck/plugin-sdk';
```

## 1. Call model

```ts
import { callSdk } from '@devdeck/plugin-sdk';

const result = await callSdk<{ value: string | null }>('storage.get', { key: 'k' });
if (!result.ok) {
  console.error(result.error.code, result.error.message);
} else {
  console.log(result.data.value);
}
```

- Each namespace method is a thin wrapper around `callSdk(method, params)`.
- Every call resolves to a result object; it does not throw on host errors.
- Result shape: `{ ok: true, data: T } | { ok: false, error: { code, message, details? } }`.

Common error codes: `permission_denied`, `not_installed`, `plugin_disabled`,
`unimplemented_permission`, `invalid_argument`, `not_found`, `timeout`,
`unsupported`, `io`, `internal`.

Always call `followHostTheme()` once at startup and listen for events before
opening sockets or SSH channels.

## 2. Namespaces

Signatures below omit the `SdkResult` wrapper; see §1 for the result shape.

### `sdk.storage` — `storage:kv`

All methods below return `Promise<SdkResult<T>>`; `T` is shown for each method.

```ts
sdk.storage.get<T>(key); // T = { value: T | null }
sdk.storage.set(key, value); // T = { saved: boolean }
sdk.storage.delete(key); // T = { deleted: boolean }
sdk.storage.keys(); // T = { keys: string[] }
sdk.storage.clear(); // T = { cleared: boolean }
```

Storage is host-owned JSON scoped to the plugin id and survives updates.

Values are capped at 1 MiB and each plugin at 8 MiB. Keep settings and small
state here; for datasets, caches, and other blobs larger than a few hundred KiB
use `sdk.fs.writePluginData` so one large value does not compete with settings
for the quota or slow down every save.

### `sdk.http` — `http:proxy` / `http:external`

```ts
sdk.http.request<T>({
  url, method?, headers?, body?, timeoutMs?, responseType?: 'text' | 'json' | 'base64'
}): Promise<{ status, headers, data: T, truncated, finalUrl }>
```

The host enforces `manifest.httpDomains` on every hop, caps response size, and
rejects non-http(s) schemes. The plugin document CSP blocks direct network
connections (`connect-src 'none'`), so use `http:proxy`; `http:external` is
accepted in manifests for compatibility but cannot bypass the proxy path.

### `sdk.log` — `log:write`

```ts
sdk.log.write(level: 'debug' | 'info' | 'warn' | 'error', message, data?)
sdk.log.info(message, data?)
sdk.log.warn(message, data?)
sdk.log.error(message, data?)
```

Entries appear in `<app-data>/logs/plugins.log`.

### `sdk.system` — `system:getInfo` / `system:openExternal`

```ts
sdk.system.openExternal(url): Promise<{ opened: boolean }>
sdk.system.getInfo(): Promise<{ platform, arch, appVersion, tauriVersion }>
```

`openExternal` only accepts http(s) URLs. Host-side permissions for
notifications, path reveal/open, environment variables, and clipboard are
reserved for a future SDK revision; they are not exposed in 2.0.

### `sdk.theme` — `theme:read`

```ts
sdk.theme.get(): Promise<{ theme: 'light' | 'dark' }>
```

`followHostTheme(onChange?)` sets `<html data-theme>` and keeps it in sync; it
also reads the `?theme=` query parameter on first load.

### `sdk.fs` — `fs:dialog`, `fs:read`, `fs:write`, `fs:plugin-data`

```ts
sdk.fs.pickFile({ title?, filters?, multiple? }): Promise<{ items: GrantedFile[] }>
sdk.fs.pickSaveFile({ title?, suggestedName?, filters? }): Promise<GrantedFile | null>
sdk.fs.readFile({ fileToken, encoding? }): Promise<FileContents>
sdk.fs.writeFile({ fileToken, content, encoding? }): Promise<{ written: number }>
sdk.fs.readPluginData({ path, encoding? }): Promise<FileContents>
sdk.fs.writePluginData({ path, content, encoding? }): Promise<{ written: number }>
```

Paths never reach the plugin. The host returns opaque file tokens bound to the
requesting plugin; plugin-data paths are sandboxed to the plugin's data folder.

### `sdk.ssh` — `net:ssh`

```ts
sdk.ssh.connect({ host, port?, username, password?, privateKey?, passphrase?, sessionId? })
  : Promise<{ sessionId, host, port, username, fingerprint }>
sdk.ssh.openShell({ sessionId, cols?, rows?, term? }): Promise<{ sessionId, channelId }>
sdk.ssh.exec({ sessionId, command }): Promise<{ sessionId, channelId }>
sdk.ssh.write({ sessionId, channelId, data, encoding? }): Promise<{ written: boolean }>
sdk.ssh.resize({ sessionId, channelId, cols, rows }): Promise<{ resized: boolean }>
sdk.ssh.closeChannel(sessionId, channelId)
sdk.ssh.disconnect(sessionId)
sdk.ssh.list(): Promise<{ sessions: SshSessionInfo[] }>
sdk.ssh.forgetHost(host, port?)
```

Host keys are pinned on first use (TOFU). Terminal output and status arrive via
`onSshEvent`. The host supports password and OpenSSH key authentication; one
session hosts multiple channels; writes are capped.

### `sdk.sftp` — `net:ssh`

```ts
sdk.sftp.list({ sessionId, path })
sdk.sftp.read({ sessionId, path, encoding? })
sdk.sftp.write({ sessionId, path, content, encoding? })
sdk.sftp.mkdir({ sessionId, path })
sdk.sftp.remove({ sessionId, path, directory? })
sdk.sftp.rename({ sessionId, from, to })
sdk.sftp.realpath({ sessionId, path })
```

SFTP files are size-limited; downloads return text or base64.

### `sdk.socket` — `net:socket`

```ts
sdk.socket.tcpConnect({ host, port }): Promise<{ sessionId }>
sdk.socket.tcpSend({ sessionId, data, encoding? })
sdk.socket.tcpClose(sessionId)
sdk.socket.tcpListen({ host?, port? }): Promise<{ sessionId, port }>
sdk.socket.serverSend({ sessionId, clientId, data, encoding? })
sdk.socket.serverKick(sessionId, clientId)
sdk.socket.udpBind({ host?, port? }): Promise<{ sessionId, port }>
sdk.socket.udpSend({ sessionId, host, port, data, encoding? })
sdk.socket.close(sessionId)
sdk.socket.list()
```

Binary data is base64 on the wire; text chunks also carry `text`. Use
`onSocketEvent(handler)` for `connected`, `data`, `closed`, `error`, and server
events, plus `socketEventBytes(payload)` for raw bytes.

### `sdk.capabilities`

```ts
sdk.capabilities.list(): Promise<{ grant: CapabilityGrant | null }>
```

Returns the permissions, HTTP domains, env allowlist, and grant timestamp issued
to this plugin.

## 3. Events

```ts
const stopSocket = onSocketEvent((event) => {
  if (event.event === 'data') {
    const bytes = socketEventBytes(event);
    render(event.text ?? bytes.length);
  }
});

const stopSsh = onSshEvent((event) => {
  if (event.event === 'data') terminal.write(event.text ?? '');
});

// on unmount
stopSocket();
stopSsh();
```

Both helpers filter for `event.source`/message type and return an unsubscribe
function.

## 4. Permission mapping

| SDK namespace                       | Permission                                      |
| ----------------------------------- | ----------------------------------------------- |
| `storage`                           | `storage:kv`                                    |
| `http`                              | `http:proxy` or `http:external` + `httpDomains` |
| `log`                               | `log:write`                                     |
| `system.openExternal`               | `system:openExternal`                           |
| `system.getInfo`                    | `system:getInfo`                                |
| `theme`                             | `theme:read`                                    |
| `fs.pickFile/pickSaveFile`          | `fs:dialog`                                     |
| `fs.readFile/writeFile`             | `fs:read` / `fs:write`                          |
| `fs.readPluginData/writePluginData` | `fs:plugin-data`                                |
| `ssh`, `sftp`                       | `net:ssh`                                       |
| `socket`                            | `net:socket`                                    |
| `capabilities`                      | always available                                |

## 5. Compatibility and limits

- `sdkVersion: "2.0"` selects this surface. Older manifests get legacy aliases
  and response shapes; new plugins should not depend on them.
- HTTP requests are hop-checked against `httpDomains`, size-capped, and
  time-limited; redirects to non-allowlisted hosts are rejected.
- SSH host keys are pinned in `known-hosts.json`; changing keys is rejected until
  the user forgets the host.
- The plugin CSP blocks `connect-src`, `frame-src`, `object-src`, `base-uri`, and
  `form-action`; all network access goes through the SDK.

See [Marketplace Authoring](marketplace-v2.md) for a tutorial and
[Marketplace protocol](../architecture/marketplace.md) for host-side details.
