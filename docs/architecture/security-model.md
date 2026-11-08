# Security Model

This document states the security invariants of the Rust + Tauri host and where
each one is enforced. It is meant to be read before changing anything under
`apps/desktop/src-tauri` or `crates/`.

## Trust boundaries

| Boundary             | Untrusted side                              | Enforcement point                                      |
| -------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Renderer → host      | Web content (React app, third-party plugin) | `commands.rs` argument validation, Tauri capabilities  |
| Plugin → host        | Arbitrary JavaScript from a registry        | `sdk::dispatch` + `CapabilityBroker`                   |
| Registry → installer | Network documents                           | `devdeck-contract` validation + `devdeck-market` |
| Package → filesystem | Attacker-controlled ZIP                     | `package::extract_zip` + `resolve_within`              |

Everything on the untrusted side is assumed to be able to send arbitrary bytes,
paths, URLs, and JSON. No policy decision may be made in the renderer alone.

## Invariants

### 1. A plugin can only call what its manifest declares

`CapabilityBroker::require` is the single gate. `Grant` is built from the
installed manifest at startup and on every install/enable. A plugin cannot widen
its grant by calling `capability.list` or by editing its own files.

Enforced in: `crates/devdeck-capability/src/broker.rs`.

### 2. Installation precedes every call

`AppState::require_active` rejects calls for unknown or disabled plugins before
permission checks run. The manifest stored in `marketplace-state.json`, not the
one on disk, is the source of truth — a plugin cannot rewrite `manifest.json`
after installation to gain capabilities.

Enforced in: `apps/desktop/src-tauri/src/state.rs`.

### 2b. File access is token-based and per-session

Plugins never receive paths. A native dialog returns an opaque token bound to
`(plugin_id, path, writable)`. `fs.readFile`/`fs.writeFile` resolve only
registered tokens, reject tokens belonging to other plugins, and refuse writes
to read-only grants. Disabling or uninstalling a plugin revokes its tokens.

`fs:plugin-data` uses the same `resolve_within` + `ensure_within` sandbox as the
installer, so `..` and symlink escapes are rejected.

Enforced in: `apps/desktop/src-tauri/src/files.rs`.

### 2c. SSH host keys are pinned

The first connection to `host:port` records the server key fingerprint in
`known-hosts.json`. A later mismatch aborts the handshake with
`permission_denied`; rotation requires the user/plugin to call
`ssh.forgetHost` explicitly. Authentication (password or OpenSSH key) happens
in Rust; the plugin never sees credentials after the call returns.

Enforced in: `apps/desktop/src-tauri/src/ssh.rs`.

### 2d. Plugin documents cannot open network connections directly

Every `plugin://` response carries a strict `Content-Security-Policy` with
`connect-src 'none'`, so `fetch`, `XMLHttpRequest`, `WebSocket`, and
`EventSource` fail inside a plugin document. Network access must go through the
capability broker (`http.request`, `socket.*`, `ssh.*`) where permissions,
allowlists, and limits are enforced. Inline scripts remain allowed because
published plugins ship theme bootstraps inline; they cannot exfiltrate data
without a network primitive.

Enforced in: `apps/desktop/src-tauri/src/protocol.rs`.

### 3. Paths never escape their sandbox

Two layers:

- `resolve_within` rejects absolute paths, `..`, Windows separators, and NUL
  bytes when a path is _constructed_.
- `ensure_within` canonicalizes and re-checks containment after symlink
  resolution when a path is _used_.

The `plugin://` protocol handler applies both: it resolves under the plugin
directory and serves only files that still live there.

Enforced in: `crates/devdeck-contract/src/path.rs`,
`apps/desktop/src-tauri/src/protocol.rs`.

### 4. Network access is allowlisted per host, per hop

`authorize_http` requires `http:proxy` or `http:external`, restricts the scheme
to `http`/`https`, rejects embedded credentials, and matches the host against
`httpDomains` (exact or `*.subdomain`).

Redirects are **not** followed automatically. `http.rs` loops manually, and
re-authorizes each `Location` before issuing the next request, so a permitted
host cannot bounce to an unlisted one.

Enforced in: `crates/devdeck-capability/src/broker.rs`,
`apps/desktop/src-tauri/src/http.rs`.

### 5. Packages are verified before they are unpacked

SHA-256 and optional Ed25519 are checked against the raw bytes before the ZIP
reader sees them. Extraction then enforces path safety, entry-type safety, and
resource limits while streaming, comparing declared and actual sizes.

The registry document itself carries a detached Ed25519 signature when the
source has a pinned public key; requiring it is a per-source setting. Signatures
are verified against the exact bytes before parsing.

Enforced in: `crates/devdeck-market/src/signing.rs`,
`crates/devdeck-market/src/package.rs`, `apps/desktop/src-tauri/src/registry.rs`.

### 6. Upgrades are atomic and never silently downgrade

Extraction happens in `.staging/`, validation runs there, and only then does a
rename swap the plugin directory. Refusing downgrades by default closes the
"reinstall an old vulnerable version" path.

Enforced in: `crates/devdeck-market/src/store.rs`.

### 7. Plugin code cannot reach the host document

Plugins are served from a different scheme (`plugin://localhost`) inside an
iframe with `sandbox="allow-scripts allow-forms allow-popups"` and no
`allow-same-origin`, giving the frame an opaque origin. The parent only accepts
messages whose `event.source` is that exact iframe.

React-rendered HTML goes through the same escaping rules as the rest of the app;
plugins cannot inject into the host DOM.

Enforced in: `apps/desktop/src/components/PluginView.tsx`,
`apps/desktop/src-tauri/src/protocol.rs`, `apps/desktop/src-tauri/tauri.conf.json`.

### 8. The host surface stays small

There is exactly one command that reaches plugin capabilities
(`plugin_sdk_call`) plus CRUD commands for plugin management. No generic
"read file", "run command", or "fetch URL" command exists for the renderer.

Enforced by review: `apps/desktop/src-tauri/src/commands.rs`.

## Content Security Policy

`tauri.conf.json` sets:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: plugin: http://plugin.localhost;
frame-src 'self' plugin: http://plugin.localhost;
font-src 'self' data:;
connect-src 'self' ipc: http://ipc.localhost ws: wss:
```

The `ws:`/`wss:` entries exist for the built-in WebSocket tester; the plugin
document itself is served with a stricter policy:

```
default-src 'self' data: blob:;
script-src 'self' 'unsafe-inline';
connect-src 'none';
frame-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none'
```

`style-src 'unsafe-inline'` is required by React inline styles and plugin CSS
injection; scripts and frames are locked down. Inline scripts in plugins are
allowed only because published plugins bootstrap the theme inline and cannot
exfiltrate data without a network primitive. Adding a remote origin here is a
security change and needs review.

## Resource limits

| Resource                    | Limit                  | Where           |
| --------------------------- | ---------------------- | --------------- |
| Package entries             | 20 000                 | `InstallLimits` |
| Package size (uncompressed) | 512 MiB                | `InstallLimits` |
| Single file in package      | 64 MiB                 | `InstallLimits` |
| HTTP response body          | 8 MiB (truncated)      | `http.rs`       |
| HTTP timeout                | 15 s default, 60 s max | `http.rs`       |
| Plugin KV value             | 1 MiB                  | `storage.rs`    |
| Plugin KV total             | 8 MiB                  | `storage.rs`    |
| Plugin log file             | 5 MiB, rotated         | `logs.rs`       |
| Log message                 | 8 KiB, truncated       | `logs.rs`       |

## What a plugin cannot do

- Read or write files outside its own package directory, KV namespace, or
  user-granted tokens.
- Open a TCP/UDP socket or SSH session without `net:socket` / `net:ssh`.
- Reach a host not listed in `httpDomains`.
- Read environment variables not listed in `envAllowlist`.
- Execute a program, load a native library, or access host/native APIs.
- Change its own permissions, or survive a manifest edit after install.
- Access another plugin's storage, logs, or grants.

## Reporting a vulnerability

Please read [`docs/governance/security.md`](../governance/security.md) and report
privately. Do not open a public issue for a bypass of any invariant above.

> 中文镜像：[docs/zh-CN/architecture/security-model.md](../zh-CN/architecture/security-model.md)
