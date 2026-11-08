# Architecture Overview

DevDeck is a desktop toolbox with two halves:

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
| Testable policy        | `devdeck-contract`, `-capability`, and `-market` have no Tauri dependency and are unit tested in CI        |

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
│   ├─ socket.rs, ssh.rs       TCP/UDP, SSH/SFTP sessions         │
│   ├─ mqtt.rs, certs.rs       MQTT client, X.509 utilities       │
│   └─ state.rs, storage.rs    runtime state and settings         │
├─────────────────────────────────────────────────────────────────┤
│ crates/                     framework-free policy crates        │
│   ├─ devdeck-contract     manifest, permissions, registry    │
│   ├─ devdeck-capability   grants, allowlists, path sandbox   │
│   └─ devdeck-market       verification, install, state       │
└─────────────────────────────────────────────────────────────────┘
```

Dependency direction is strictly downward. A policy crate never imports Tauri,
never reads the UI, and never performs network I/O on its own, which is what
makes it testable and reusable by CLI tooling.

## Repository layout

| Path                           | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `apps/desktop/src`             | React renderer: legacy shell/pages, 27 tools, plugin bridge      |
| `apps/desktop/src/legacy`      | Sidebar, dashboard, tools workspace, module center, settings     |
| `apps/desktop/src/theme`       | Legacy color/type tokens and global styles                       |
| `apps/desktop/src-tauri`       | Tauri configuration, Rust host, capabilities                     |
| `crates/devdeck-contract`   | Shared vocabulary: ids, manifests, permissions, registry, errors |
| `crates/devdeck-capability` | Capability broker and filesystem sandbox                         |
| `crates/devdeck-market`     | Package verification, extraction, install state                  |
| `packages/plugin-sdk`          | Published npm SDK used by plugin authors                         |
| `marketplace/`                 | Plugin workspace, pack/sign/registry tooling                     |
| `scripts/`                     | Acceptance, updater rehearsal, legacy-import guard               |
| `docs/`                        | Documentation (this file included)                               |

## UI shell

The renderer keeps the original Electron layout (`main` branch), restored in
`apps/desktop/src/legacy/`:

- **Sidebar** — Dashboard, Tools, Marketplace, Settings; collapsible to an icon
  rail; tool categories appear while Tools is active.
- **Dashboard** — search, category quick-nav, frequently used tools, app/screen/
  runtime widgets.
- **Tools workspace** — 252px tool list panel, browser-style tabs, tool header
  with fullscreen toggle; tools stay mounted while switching tabs.
- **Module center** — installed/marketplace tabs, registry bar, filters, cards.
- **Settings** — flat grouped preferences: theme/language, registries (including
  trust options), updates, and about.
- **Global search** (`Cmd/Ctrl+K`) and About dialog.

The native Tauri menu mirrors the legacy menu (Settings `Cmd+,`, edit roles,
theme/language, About). The shortcut contract is documented in the
[design system](../design-system.md).

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

The old Electron host exposed one IPC channel per feature. Adding a capability
meant touching the contract, preload bridge, main-process handler, and renderer
service. The Tauri host replaces that with a single gated method:

```rust
#[tauri::command]
async fn plugin_sdk_call(plugin_id, method, params) -> Result<Value, DevDeckError>
```

`method` selects the capability (`storage.set`, `http.request`, `log.write`, …),
`params` is a JSON object, and the broker enforces the permission before the
implementation runs. New capabilities are additive: one match arm plus one
permission, with no new IPC surface.

## Command surface

The renderer can only call the commands registered in `lib.rs`:

`app_info`, `plugin_list`, `plugin_uninstall`, `plugin_set_enabled`,
`cert_generate_key|ca|csr`, `cert_issue`, `cert_parse`, `system_ping`, `tcp_ping`,
`mqtt_connect|subscribe|publish|disconnect`, `traceroute`,
`registry_list_sources|add_source|remove_source|refresh`,
`plugin_install_from_registry`, `theme_set`, `language_set`, and
`plugin_sdk_call`.

Everything a plugin does funnels through `plugin_sdk_call`.

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
   │ postMessage({ type: 'devdeck:sdk:request', method, params })
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
   `crates/devdeck-contract/src/permission.rs` (wire string is public API).
2. Add the allowlist rules to `crates/devdeck-capability/src/broker.rs`.
3. Add one arm to `sdk::dispatch` and implement it in the host.
4. Expose a typed helper in `packages/plugin-sdk`.
5. Document it in `docs/plugin-dev/marketplace-v2.md` and add a test.

Steps 1–4 are the whole contract. No preload shim, no per-feature command.

## Adding a built-in tool

Built-in tools are renderer-only and should not need Rust at all.

```
apps/desktop/src/tools/
├── registry.ts              the single place a tool is registered
└── types.ts                 ToolDefinition / categories

apps/desktop/src/legacy-renderer/
├── components/ModuleTools/<Folder>/   legacy tool UI + CSS module + locales
└── ui/                                @@components: ToolSection, SplitPane, ...
```

Rules:

- keep the tool UI in the restored legacy component tree so the layout matches
  the original application;
- register the tool once in `registry.ts` with a lazy import, keywords, i18n
  keys, and category;
- map the category and icon in `apps/desktop/src/legacy/data.tsx`;
- add `tool.<id>.name` / `.desc` keys to both dictionaries;
- tools that need privileges (files, network, SSH) call a host command through
  the legacy compatibility bridge — never host APIs directly.

Step-by-step instructions live in the [development guide](../development.md).

## Testing strategy

| Layer      | Test type                                                                                      | Location                         |
| ---------- | ---------------------------------------------------------------------------------------------- | -------------------------------- |
| Contract   | Unit tests for ids, manifests, permissions, registry, path sandbox                             | `crates/*/src/**` `#[cfg(test)]` |
| Capability | Unit tests for every allowlist rule and each failure mode                                      | `crates/devdeck-capability`   |
| Market     | End-to-end install tests against in-memory ZIP fixtures, including zip-slip and zip-bomb cases | `crates/devdeck-market`       |
| Host       | Command behavior, sockets, MQTT, certificates, SSH end-to-end against an in-process server     | `apps/desktop/src-tauri/src`     |
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

- [Development guide](../development.md)
- [Design system](../design-system.md)
- [Marketplace protocol](marketplace.md)
- [Security model](security-model.md)
- [Migration record](migration.md)
- [Plugin authoring guide](../plugin-dev/marketplace-v2.md)

> 中文镜像：[docs/zh-CN/architecture/overview.md](../zh-CN/architecture/overview.md)
