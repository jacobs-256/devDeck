# Architecture Overview

DevToolBox is a desktop toolbox with two halves:

- a **JavaScript/TypeScript front end** that owns everything the user sees, and
- a **Rust host** that owns every privileged operation and every policy decision.

The desktop shell is Tauri 2. The split is not cosmetic: the renderer is treated
as untrusted input, and third-party Marketplace plugins are treated as actively
hostile code.

## Design goals

| Goal                   | How the architecture delivers it                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Small, fast installers | Tauri uses the OS webview instead of bundling Chromium                                                        |
| Auditable security     | One Rust entry point per privilege domain; policy lives in crates without UI code                             |
| Easy to contribute     | Tools and plugins are plain web apps; Rust is only needed for host capabilities                               |
| Open ecosystem         | Marketplace protocol, manifest schema, SDK, and signing are documented and versioned independently of the app |
| Testable policy        | `devtoolbox-contract`, `-capability`, and `-market` have no Tauri dependency and are unit tested in CI        |

## Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ apps/desktop/src            React renderer (untrusted)          │
│   ├─ pages, tools            built-in tools                     │
│   └─ pluginBridge.ts         postMessage ⇄ invoke bridge        │
├─────────────────────────────────────────────────────────────────┤
│ apps/desktop/src-tauri      Tauri host (trusted)                │
│   ├─ commands.rs             the only invokable surface         │
│   ├─ sdk.rs                  ONE gated dispatcher for plugins   │
│   ├─ protocol.rs             plugin:// asset server             │
│   ├─ http.rs, logs.rs        capability implementations         │
│   └─ state.rs, storage.rs    runtime state                      │
├─────────────────────────────────────────────────────────────────┤
│ crates/                     framework-free policy crates        │
│   ├─ devtoolbox-contract     manifest, permissions, registry    │
│   ├─ devtoolbox-capability   grants, allowlists, path sandbox   │
│   └─ devtoolbox-market       verification, install, state       │
└─────────────────────────────────────────────────────────────────┘
```

Dependency direction is strictly downward. A policy crate never imports Tauri,
never reads the UI, and never performs network I/O on its own, which is what
makes it testable and reusable by CLI tooling.

## Repository layout

| Path                           | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `apps/desktop/src`             | React shell, built-in tool pages, plugin bridge                  |
| `apps/desktop/src-tauri`       | Tauri configuration, Rust host, capabilities                     |
| `crates/devtoolbox-contract`   | Shared vocabulary: ids, manifests, permissions, registry, errors |
| `crates/devtoolbox-capability` | Capability broker and filesystem sandbox                         |
| `crates/devtoolbox-market`     | Package verification, extraction, install state                  |
| `packages/plugin-sdk`          | Published npm SDK used by plugin authors                         |
| `marketplace/`                 | First-party plugin sources and release tooling                   |
| `docs/`                        | Documentation (this file included)                               |

## Process and trust boundaries

1. **Renderer → host.** All calls go through `#[tauri::command]` functions in
   `commands.rs`. Tauri's capability file allowlists which plugins the window
   may use. The renderer never receives filesystem paths it did not already
   choose through a dialog.
2. **Plugin → host.** A plugin runs in a sandboxed iframe served from
   `plugin://localhost/<id>/`. It can only reach the host by `postMessage`; the
   renderer re-checks `event.source` and forwards the request to
   `plugin_sdk_call`, which re-validates installation, enablement, and the
   specific permission on every call.
3. **Host → OS.** Capability implementations (`http.rs`, `logs.rs`,
   `storage.rs`, `protocol.rs`) are the only places that touch the network,
   disk, or the opener plugin.

## One dispatcher, not sixty commands

The legacy Electron host exposed 63 bespoke IPC channels. Adding a capability
meant touching the contract, the preload bridge, the main-process handler, and
the renderer service.

The Tauri host replaces that with a single gated method:

```rust
#[tauri::command]
async fn plugin_sdk_call(plugin_id, method, params) -> Result<Value, DevToolboxError>
```

`method` selects the capability (`storage.set`, `http.request`, `log.write`, …),
`params` is a JSON object, and the broker enforces the permission before the
implementation runs. New capabilities are additive: one match arm plus one
permission, with no new IPC surface.

## Install flow

```
registry.json ──validate──► RegistryIndex
                               │
                          download .zip
                               │
                    SHA-256 + Ed25519 verify
                               │
                    extract to .staging/<id>
                               │
              manifest.json validate + layout check
                               │
                   atomic rename → plugins/<id>
                               │
                   state file update (atomic write)
                               │
                   grant capabilities from manifest
```

Failure at any step leaves the previous installation untouched: staging
directories are deleted, and upgrades swap directories only after the new
package fully validates.

## SDK call flow

```
plugin iframe
   │ postMessage({ type: 'devtoolbox:sdk:request', method, params })
   ▼
renderer (pluginBridge.ts)  ── event.source check
   │ invoke('plugin_sdk_call', { pluginId, method, params })
   ▼
commands::plugin_sdk_call
   │
   ▼
sdk::dispatch
   ├─ require_active(plugin)        installed && enabled
   ├─ broker.require(permission)    manifest declared it?
   ├─ allowlist check               host / env / path
   └─ implementation                storage | http | log | opener
```

## Adding a capability

1. Add the permission id to `Permission` in
   `crates/devtoolbox-contract/src/permission.rs` (wire string is public API).
2. Add the allowlist rules to `crates/devtoolbox-capability/src/broker.rs`.
3. Add one arm to `sdk::dispatch` and implement it in the host.
4. Expose a typed helper in `packages/plugin-sdk`.
5. Document it in `docs/plugin-dev/marketplace-v2.md` and add a test.

Steps 1–4 are the whole contract. No preload shim, no per-feature command.

## Adding a built-in tool

Built-in tools are renderer-only and should not need Rust at all.

```
apps/desktop/src/tools/
├── registry.ts              the single place a tool is registered
├── types.ts                 ToolDefinition / categories
├── components.tsx           CopyButton, ErrorText
└── module-tools/<tool>/
    ├── <tool>.model.ts      pure logic (no React, no window.*)
    ├── <tool>.model.test.ts Vitest unit tests
    └── <ToolName>.tsx       UI
```

Rules:

- keep logic in the `.model.ts` file so it is testable in Node;
- register the tool once in `registry.ts` with keywords for search;
- tools that need privileges (files, network, SSH) call a host command — never
  `fetch`, `fs`, or Electron APIs directly;
- add at least one test per model file; `pnpm --filter @devtoolbox/desktop test`
  runs them.

## Testing strategy

| Layer      | Test type                                                                                      | Location                         |
| ---------- | ---------------------------------------------------------------------------------------------- | -------------------------------- |
| Contract   | Unit tests for ids, manifests, permissions, registry, path sandbox                             | `crates/*/src/**` `#[cfg(test)]` |
| Capability | Unit tests for every allowlist rule and each failure mode                                      | `crates/devtoolbox-capability`   |
| Market     | End-to-end install tests against in-memory ZIP fixtures, including zip-slip and zip-bomb cases | `crates/devtoolbox-market`       |
| Host       | `cargo check` / `cargo clippy`; command behavior is thin by construction                       | CI                               |
| Renderer   | `tsc --noEmit` + `vite build` + Vitest for pure helpers                                        | `apps/desktop`                   |

Security-relevant rules are tested **in the crate that enforces them**, not
through the UI, so a regression fails fast and locally.

## Internationalization

The shell and Marketplace ship with English and Simplified Chinese
(`apps/desktop/src/i18n/`). The language is persisted in `settings.json` next to
the theme and applied on startup.

- Dictionaries are flat, keyed maps; `zh-CN` is typed as `Dictionary`, so a
  missing key fails the TypeScript build.
- `translate()` supports `{name}` interpolation and falls back to the key.
- All 27 tool bodies, names, descriptions, and categories are translated.
  Protocol/status tokens (for example MQTT connection states or WebSocket
  readyState names) stay as technical terms.

## Related documents

- [Marketplace protocol](marketplace.md)
- [Security model](security-model.md)
- [Migration status](migration.md)
- [Plugin authoring guide](../plugin-dev/marketplace-v2.md)

> 中文镜像：[docs/zh-CN/architecture/overview.md](../zh-CN/architecture/overview.md)
