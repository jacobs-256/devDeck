# Plugin Developer Guide

DevToolBox plugins are small web applications that run in a sandboxed iframe and
reach the host only through the SDK. This guide covers the runtime, manifest,
permissions, local development, and publishing. For a step-by-step tutorial see
[Marketplace Authoring (SDK 2.0)](marketplace-v2.md).

## 1. Runtime model

- The plugin is served from `plugin://localhost/<id>/<entry>` by the Rust host.
- The iframe uses `sandbox="allow-scripts allow-forms allow-popups"` with an
  opaque origin, so plugin JS cannot read the host DOM or `localStorage`.
- The plugin document CSP sets `connect-src 'none'`: `fetch`, XHR, and WebSocket
  inside the plugin are blocked. Network access must go through `sdk.http`,
  `sdk.socket`, or `sdk.ssh`.
- Calls travel by `postMessage` to the host renderer, which invokes the single
  gated `plugin_sdk_call` command. The host re-checks installation, enablement,
  and permissions on every call.
- Events (socket data, SSH output) are pushed back as `devtoolbox:event`
  messages; use `onSocketEvent` / `onSshEvent`.

## 2. Scaffold

Inside the repository:

```bash
node marketplace/scripts/create.mjs --id market-my-tool --name "My Tool"
pnpm --filter @devtoolbox/plugin-market-my-tool build
```

The scaffold creates:

```text
marketplace/modules/market-my-tool/
├── manifest.json
├── index.html
├── package.json
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── sdk.ts          re-exports @devtoolbox/plugin-sdk
│   └── style.css
└── vite.config.ts
```

Standalone plugins can depend on `@devtoolbox/plugin-sdk@2` from npm and build
with any bundler; the package shape is `manifest.json` + an entry folder.

## 3. manifest.json

```json
{
  "schemaVersion": 2,
  "id": "market-my-tool",
  "name": "My Tool",
  "description": "What the plugin does",
  "version": "1.0.0",
  "sdkVersion": "2.0",
  "entry": "package/index.html",
  "categoryId": "text-tools",
  "author": "Your Name",
  "license": "MIT",
  "homepage": "https://example.com",
  "repository": "https://github.com/example/my-tool",
  "keywords": ["example"],
  "permissions": ["storage:kv"],
  "httpDomains": [],
  "envAllowlist": []
}
```

Rules (enforced by `crates/devtoolbox-contract/src/manifest.rs`):

- `id` is kebab-case and starts with `market-`.
- `version` is SemVer; `(id, version)` must be unique per registry.
- `entry` is a relative path inside the package.
- `permissions` must be known permission ids.
- `httpDomains` entries are exact hosts or `*.example.com` wildcards; they are
  required for `http:*`.
- `envAllowlist` lists exact environment variable names for `system:env:read`.
- Schema 1 manifests install with a `legacy_sdk` warning; see §9.

## 4. Permissions

| Permission                              | Grants                                                  |
| --------------------------------------- | ------------------------------------------------------- |
| `storage:kv`                            | Host-owned key/value store                              |
| `http:proxy`                            | `sdk.http.request` through the host                     |
| `http:external`                         | Direct HTTP from the plugin webview (subject to CORS)   |
| `fs:dialog`                             | Open/save dialogs                                       |
| `fs:read` / `fs:write`                  | Read/write files selected through dialogs (token-based) |
| `fs:plugin-data`                        | Plugin data directory                                   |
| `net:socket`                            | TCP/UDP client and server                               |
| `net:ssh`                               | SSH terminals, exec, SFTP                               |
| `system:openExternal`                   | Open http(s) links in the browser                       |
| `system:revealPath` / `system:openPath` | Reveal/open user-selected paths                         |
| `system:notifications`                  | Desktop notifications                                   |
| `system:env:read`                       | Read allowlisted environment variables                  |
| `system:getInfo`                        | App/platform metadata                                   |
| `clipboard:write`                       | Write the clipboard                                     |
| `log:write`                             | Plugin log                                              |
| `theme:read`                            | Current light/dark theme                                |

`bluetooth`, `serial`, and `usb` are reserved: manifests may declare them, but
calls fail with `unimplemented_permission` until a host implementation lands.

## 5. Using the SDK

```ts
import { sdk, followHostTheme, onSocketEvent } from '@devtoolbox/plugin-sdk';

followHostTheme();
await sdk.storage.set('lastQuery', 'hello');
const { value } = await sdk.storage.get<string>('lastQuery');
const response = await sdk.http.request({ url: 'https://api.example.com/data' });
sdk.log.info('loaded', response.status);
```

- Every SDK call returns the host `data` payload or throws a
  `DevToolboxSdkError` with `code`, `message`, and optional `details`.
- `sdk.capabilities.list()` returns the grant issued for this plugin.
- See [SDK reference](sdk.md) for every namespace and event.

## 6. Local development

The host has no “install folder/zip” button; use a local registry:

```bash
# Build
pnpm --filter @devtoolbox/plugin-market-my-tool build

# Pack + sign
pnpm --filter @devtoolbox/marketplace pack market-my-tool
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/my-key.txt) \
  pnpm --filter @devtoolbox/marketplace sign .local-dist/market-my-tool-0.1.0.zip

# Registry for the local HTTP server
pnpm --filter @devtoolbox/marketplace registry market-my-tool \
  --base-url http://127.0.0.1:8765 --out .local-dist/registry.json
python3 -m http.server 8765 --directory marketplace/.local-dist
```

Add `http://127.0.0.1:8765/registry.json` in **Marketplace**. For signed
registries, pin the public key under **Settings → Registries → Trust options**.

Plugin logs go to `<app-data>/logs/plugins.log`; SDK denials include a stable
error code.

## 7. Package layout

```text
market-my-tool-1.0.0.zip
├── manifest.json
└── package/
    ├── index.html
    └── assets/...
```

`entry` points at `package/index.html`; the host rejects absolute paths, `..`,
symlinks, and nested archives.

## 8. Publishing

```bash
pnpm --filter @devtoolbox/marketplace registry --all \
  --base-url https://example.com/marketplace --out release-dist/registry.json
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/marketplace-key.txt) \
  pnpm --filter @devtoolbox/marketplace sign release-dist/registry.json
```

Upload `registry.json`, `registry.json.sig`, and every `*.zip` (+ `.sig`) to any
HTTPS host. The repository release workflow automates this; see
[Packaging and signing](packaging.md) and
[Marketplace release](../architecture/release.md#publish-a-marketplace-release).

## 9. SDK 1.x compatibility

The host maps legacy method names and response shapes when
`manifest.sdkVersion` is `1.x`. New plugins should target `sdkVersion: "2.0"`:

- `manifest.schemaVersion` 2, `sdkVersion` `"2.0"`;
- use `sdk.*` namespaces and `{ ok, data }` results;
- declare all permissions explicitly.

Legacy aliases (for example `socket.clientConnect`) remain available during the
compatibility window but should not be used in new code.
