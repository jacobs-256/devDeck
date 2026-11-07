# Marketplace Plugin Authoring (SDK 2.0)

This guide is for **third-party plugin authors**. You only need HTML, CSS, and
JavaScript/TypeScript — Rust is only required for host capabilities, which are
maintained by the DevToolBox project.

- Protocol specification: [Marketplace protocol](../architecture/marketplace.md)
- Security model: [Security model](../architecture/security-model.md)

## 1. What a plugin is

A plugin is a static web app:

```
my-plugin/
├── manifest.json      # identity, entry point, permissions
├── src/               # your source (any framework)
├── package.json
├── vite.config.ts
└── package/           # build output, shipped in the .zip
    └── index.html
```

The host serves `package/` from `plugin://localhost/<your-id>/` inside a
sandboxed iframe and injects nothing into your page. You reach the host only
through `@devtoolbox/plugin-sdk`.

## 2. Scaffold

There are two supported starting points.

### Inside the DevToolBox repository (recommended for examples)

```bash
pnpm --filter @devtoolbox/marketplace create \
  --id market-my-tool --name "My Tool" --permissions storage:kv
```

Generated layout:

```
marketplace/modules/market-my-tool/
├── manifest.json        schema 2, sdkVersion 2.0
├── package.json         includes @devtoolbox/plugin-sdk
├── vite.config.ts       base './', outDir 'package'
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx         calls followHostTheme()
│   ├── App.tsx          storage demo
│   └── style.css        light/dark via data-theme
└── README.md
```

Useful flags: `--description`, `--category`, `--author`, `--license`,
`--permissions a,b`, `--dir`, `--force`.

### As a standalone npm plugin

```bash
mkdir my-plugin && cd my-plugin
pnpm init
pnpm add @devtoolbox/plugin-sdk
pnpm add -D vite typescript @vitejs/plugin-react @types/react @types/react-dom
```

Then copy the `manifest.json`, `vite.config.ts`, `tsconfig.json`, and `src/`
layout from the generated template above, and replace the
`workspace:*` SDK dependency with the published version.

### Build shape

`vite.config.ts` must produce relative asset URLs and a `package/` directory:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { outDir: 'package', emptyOutDir: true },
});
```

## 3. `manifest.json`

```json
{
  "schemaVersion": 2,
  "id": "market-my-plugin",
  "name": "My Plugin",
  "description": "One sentence about what it does",
  "version": "0.1.0",
  "sdkVersion": "2.0",
  "entry": "package/index.html",
  "categoryId": "text-tools",
  "author": { "name": "Your Name", "url": "https://example.com" },
  "license": "MIT",
  "repository": "https://github.com/you/my-plugin",
  "permissions": ["storage:kv"],
  "httpDomains": [],
  "envAllowlist": []
}
```

Rules that trip people up:

- `id` is permanent. It is the storage namespace and the install directory name.
- `entry` must be a relative `.html` path inside the package.
- `httpDomains` is mandatory for `http:proxy` / `http:external` — list every
  host, `*.example.com` covers subdomains but not the apex.
- Unknown permission ids are a hard error.

The full field table is in the [protocol spec](../architecture/marketplace.md#3-manifest-schema-v2).

## 4. Using the SDK

```ts
import { sdk, followHostTheme } from '@devtoolbox/plugin-sdk';

followHostTheme(); // keeps data-theme in sync with the host

async function save(key: string, value: unknown) {
  const result = await sdk.storage.set(key, value);
  if (!result.ok) {
    console.error(result.error.code, result.error.message);
  }
}

async function lookup(ip: string) {
  const result = await sdk.http.request<{ country: string }>({
    url: `https://ipinfo.io/${ip}/json`,
    headers: { Accept: 'application/json' },
  });
  if (!result.ok) return `error: ${result.error.code}`;
  return result.data?.data.country ?? 'unknown';
}
```

### Result shape

Every call resolves to:

```ts
{ ok: true, data } | { ok: false, error: { code, message } }
```

Branch on `error.code`:

| Code                | Meaning                                                         |
| ------------------- | --------------------------------------------------------------- |
| `permission_denied` | Manifest does not declare the capability, or allowlist mismatch |
| `invalid_argument`  | Bad parameters (missing key, invalid URL, …)                    |
| `timeout`           | The call took longer than the SDK timeout                       |
| `not_found`         | Plugin is not installed                                         |
| `unsupported`       | Method exists in the SDK but not in this host version           |
| `internal`          | Host-side failure; safe to surface as a generic error           |

### API surface

| Call                                    | Permission                      | Notes                          |
| --------------------------------------- | ------------------------------- | ------------------------------ |
| `sdk.storage.get/set/delete/keys/clear` | `storage:kv`                    | 1 MiB per value, 8 MiB total   |
| `sdk.http.request`                      | `http:proxy` or `http:external` | Host re-checks every redirect  |
| `sdk.log.info/warn/error`               | `log:write`                     | Rotating NDJSON, 5 MiB         |
| `sdk.system.openExternal`               | `system:openExternal`           | `http(s)` only                 |
| `sdk.system.getInfo`                    | `system:getInfo`                | app/OS version                 |
| `sdk.theme.get`                         | `theme:read`                    | `light` / `dark`               |
| `sdk.capabilities.list`                 | —                               | What the host actually granted |

Handle `permission_denied` gracefully: a user may have installed an older
manifest, or a future host may narrow a capability.

### Network access is host-mediated

Plugin pages set `connect-src 'none'`, so `fetch`, `XHR`, and `WebSocket` throw.
This is deliberate: use `sdk.http.request`, `sdk.socket.*`, or `sdk.ssh.*` so the
host can enforce permissions and allowlists.

### SSH and SFTP

```ts
import { onSshEvent, sdk } from '@devtoolbox/plugin-sdk';

const stop = onSshEvent((event) => {
  if (event.event === 'data') process.stdout(event.text ?? '');
});
const session = await sdk.ssh.connect({
  host: 'example.com',
  username: 'deploy',
  privateKey: openSshKey,
});
if (session.ok) {
  const shell = await sdk.ssh.openShell({ sessionId: session.data.sessionId, cols: 120, rows: 32 });
  if (shell.ok) {
    await sdk.ssh.write({ sessionId: session.data.sessionId, channelId: shell.data.channelId, data: 'ls\n' });
  }
}

const list = await sdk.sftp.list({ sessionId, path: '/var/log' });
const file = await sdk.sftp.read({ sessionId, path: '/var/log/app.log' });
stop();
```

Host keys are pinned on first use; a mismatch fails with `permission_denied`
until you call `sdk.ssh.forgetHost(host, port)`. Socket/SSH data is Base64 on the
wire with a UTF-8 `text` convenience field.

### Files

Plugins never receive filesystem paths. The user picks a file, the host returns
an opaque token bound to your plugin, and reads/writes go through that token:

```ts
import { sdk } from '@devtoolbox/plugin-sdk';

const picked = await sdk.fs.pickFile({
  title: 'Open configuration',
  filters: [{ name: 'JSON', extensions: ['json'] }],
});
if (picked.ok && picked.data.items.length > 0) {
  const [file] = picked.data.items;
  const contents = await sdk.fs.readFile({ fileToken: file.fileToken });
  if (contents.ok) console.log(contents.data.content);
}

const target = await sdk.fs.pickSaveFile({ suggestedName: 'report.txt' });
if (target.ok && target.data) {
  await sdk.fs.writeFile({
    fileToken: target.data.fileToken,
    content: 'hello',
  });
}
```

Rules:

- `fs:dialog` shows the picker; `fs:read` / `fs:write` are checked separately;
- a token is valid only for the plugin that created it, only for this session,
  and read grants are not writable;
- files are capped at 8 MiB; use `encoding: 'base64'` for binary content;
- disabling or uninstalling the plugin revokes every token;
- `fs:plugin-data` is a separate sandbox (`readPluginData` / `writePluginData`)
  for files your plugin owns, with the same size limit and traversal protection.

### Sockets

`net:socket` gives you host-owned TCP and UDP sessions. The host opens the
socket, enforces direction and size limits, and pushes data back as events:

```ts
import { onSocketEvent, sdk } from '@devtoolbox/plugin-sdk';

const stop = onSocketEvent((event) => {
  if (event.event === 'data') console.log(event.text ?? event.data);
  if (event.event === 'closed') console.log('closed', event.message);
});

const client = await sdk.socket.tcpConnect({ host: 'example.com', port: 9000 });
if (client.ok) {
  await sdk.socket.tcpSend({ sessionId: client.data.sessionId, data: 'hello\n' });
  await sdk.socket.tcpClose(client.data.sessionId);
}

// TCP server (port 0 = ephemeral; the assigned port is returned)
const server = await sdk.socket.tcpListen({ port: 0 });
if (server.ok) {
  console.log('listening on', server.data.port);
  // reply to an accepted client:
  // sdk.socket.serverSend({ sessionId, clientId, data: 'pong' })
}

// UDP
const udp = await sdk.socket.udpBind({ port: 0 });
if (udp.ok) {
  await sdk.socket.udpSend({
    sessionId: udp.data.sessionId,
    host: '127.0.0.1',
    port: 5353,
    data: 'ping',
  });
}

stop();
```

Rules the host enforces:

- at most 32 open sessions per plugin;
- payloads up to 1 MiB per send (`utf8` or `base64` encoding);
- a session belongs to the plugin that opened it; other plugins get
  `permission_denied`;
- disabling or uninstalling the plugin closes all of its sessions immediately;
- socket data is delivered only while the plugin's window is open.

SDK 1.x method names (`socket.clientConnect`, `socket.serverSend`, …) are aliased
to the same implementation, and omitting `sessionId` falls back to the plugin's
single session.

## 5. Local development

```bash
# In the DevToolBox repository
pnpm --filter @devtoolbox/desktop tauri dev

# In your plugin
pnpm dev                      # Vite preview; SDK calls fail outside the host
pnpm build
```

Load your plugin while iterating through a local signed registry:

```bash
pnpm --filter @devtoolbox/marketplace pack market-my-plugin
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/my-key.txt) \
  pnpm --filter @devtoolbox/marketplace sign .local-dist/market-my-plugin-0.1.0.zip
pnpm --filter @devtoolbox/marketplace registry market-my-plugin \
  --base-url http://127.0.0.1:8765 --out .local-dist/registry.json

# serve .local-dist, then add http://127.0.0.1:8765/registry.json
python3 -m http.server 8765 --directory marketplace/.local-dist
```

`scripts/marketplace-acceptance.sh` automates the same flow end to end.

The host logs every permission failure with a code, so check
`<app-data>/logs/plugins.log` when a call is denied.

## 6. Packaging, signing, publishing

From the DevToolBox repository:

```bash
# 0. Scaffold if you have not already
#    pnpm --filter @devtoolbox/marketplace create --id market-my-tool --name "My Tool"

# Build and pack into marketplace/.local-dist
pnpm --filter @devtoolbox/marketplace pack market-my-plugin

# Sign (recommended; required by the official registry)
pnpm --filter @devtoolbox/marketplace keygen --out .signing/my-key.txt
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/my-key.txt) \
  pnpm --filter @devtoolbox/marketplace sign .local-dist/market-my-plugin-0.1.0.zip

# Generate a registry entry for your own registry
pnpm --filter @devtoolbox/marketplace registry market-my-plugin \
  --base-url https://example.com/marketplace --out release-dist/registry.json
```

Or do the same steps manually: zip `manifest.json` + `package/`, compute
SHA-256, and add a `RegistryEntry` to your `registry.json`. Validation happens
in the app on install, so a hand-written registry is fine as long as it matches
the spec.

Publish the `.zip` and `registry.json` anywhere HTTPS-served. Users add your
registry URL to their sources.

## 7. Review checklist

Before publishing, confirm:

- [ ] `manifest.json` validates (`pnpm --filter @devtoolbox/marketplace registry`)
- [ ] The entry HTML loads with no network access beyond `httpDomains`
- [ ] Every host call is wrapped in error handling
- [ ] No `eval`, remote scripts, or inline event handlers
- [ ] Assets use relative paths (`base: './'`)
- [ ] `license` is set and the repository is public if you want contributions
- [ ] Version follows SemVer; permission changes bump at least the minor version
- [ ] The plugin still works when a permission is denied

## 8. Versioning and deprecation

- Adding a permission or a new capability use → **minor** bump.
- Removing features or changing storage keys → **major** bump with a migration.
- If you must retire a release, set `status: "yanked"` in the registry; the host
  will not offer it for new installs but keeps existing installs working.
- Do not rename `id`. Publish a new plugin and deprecate the old one instead.

## 9. Getting help

- Open a discussion in the DevToolBox repository.
- Security issues: follow [the security policy](../governance/security.md).

> 中文镜像：[docs/zh-CN/plugin-dev/marketplace-v2.md](../zh-CN/plugin-dev/marketplace-v2.md)
