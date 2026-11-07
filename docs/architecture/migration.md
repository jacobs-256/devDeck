# Migration: Electron → Rust + Tauri 2

This branch (`rust`) rewrites the desktop shell while keeping the product
usable. The legacy Electron implementation under `core/` is frozen and remains
the reference for behavior until the migration completes.

## Status matrix

| Area                            | Electron (legacy)                  | Rust + Tauri (this branch)                         | State                   |
| ------------------------------- | ---------------------------------- | -------------------------------------------------- | ----------------------- |
| Shell & packaging               | electron-builder, ~239 MB `.app`   | Tauri 2, `bundle.targets = dmg/app/nsis`           | ✅ scaffold complete    |
| Manifest contract               | TS types in `electron-api.ts`      | `devtoolbox-contract` crate, schema v2 + v1 compat | ✅ implemented & tested |
| Permission model                | ad-hoc checks in `marketplace.ts`  | `devtoolbox-capability` broker + allowlists        | ✅ implemented & tested |
| Package verification            | sha256 in Node script              | SHA-256 + Ed25519 in `devtoolbox-market`           | ✅ implemented & tested |
| Install/uninstall/enable        | `marketplace.ts` (3020 lines)      | `devtoolbox-market::store`                         | ✅ implemented & tested |
| Plugin asset serving            | Electron `BrowserWindow`           | `plugin://` custom protocol                        | ✅ implemented          |
| Plugin bridge                   | `postMessage` + 115 IPC calls      | `postMessage` + one gated `plugin_sdk_call`        | ✅ implemented          |
| SDK 1.x compatibility           | n/a                                | legacy method aliases + response shapes            | ✅ implemented & tested |
| Example plugins                 | SDK 1.x shim                       | `market-emoji-search` + `market-ip-lookup` on 2.0  | ✅ migrated & built     |
| Plugin scaffolding              | manual                             | `marketplace/scripts/create.mjs`                   | ✅ implemented          |
| Storage / logs / theme / opener | dedicated IPC channels             | SDK methods behind permissions                     | ✅ implemented          |
| HTTP proxy                      | `plugin:httpRequest`               | `http.rs` with per-hop allowlist                   | ✅ implemented          |
| SSH / SFTP / TCP / UDP          | `ssh2`, `net`                      | TCP/UDP + SSH shell/exec + SFTP + in-process e2e   | ✅ implemented & tested |
| File dialogs (`fs:dialog`)      | `dialog.showOpenDialog`            | token-based open/save + read/write + plugin data   | ✅ implemented & tested |
| Registry fetching               | HTTP fetch in main process         | source store + fetch + signature policy + install  | ✅ implemented & tested |
| Auto-update                     | `electron-updater`                 | `tauri-plugin-updater` + signed CI release         | ✅ implemented          |
| Built-in tools (27)             | React under `core/renderer`        | all 27 ported with unit tests                      | ✅ done                 |
| i18n / themes                   | `core/renderer/i18n`, `theme`      | Shell, Marketplace, all 27 tool bodies translated  | ✅ done                 |
| Plugin author docs              | `docs/plugin-dev/*` (Electron era) | SDK 2.0 guide + scaffold + legacy banners          | ✅ done                 |

Legend: ✅ done and tested · 🟡 partial · ⬜ pending.

## What is already runnable

```bash
# Everything below was run on this branch (arm64 macOS, 2026-11-07)
cargo test -p devtoolbox-contract -p devtoolbox-capability -p devtoolbox-market

# Tauri host
cargo check -p devtoolbox-desktop

# Renderer
pnpm --filter @devtoolbox/desktop build

# Plugin SDK
pnpm --filter @devtoolbox/plugin-sdk build

# Desktop dev loop
pnpm --filter @devtoolbox/desktop tauri dev

# Bundle (verified)
pnpm --filter @devtoolbox/desktop tauri build --bundles dmg
# → target/release/bundle/dmg/DevToolBox_2.1.0_aarch64.dmg (2.1 MB)
```

Measured bundle sizes on this branch:

| Artifact     | Electron 2.0.3 | Rust + Tauri 2.1.0   |
| ------------ | -------------- | -------------------- |
| `.app`       | 239 MB         | 4.0 MB               |
| `.dmg`       | 95 MB          | 2.1 MB               |
| Debug `.app` | —              | 40 MB (no LTO/strip) |

## Migration order

1. **Tool port — done.** All 27 built-in tools are ported
   (`apps/desktop/src/tools/`), each with model or host tests. Privileged tools
   call host commands (`tcp_ping`, `traceroute`, MQTT) instead of reaching for
   the network directly.
2. **Network capabilities are complete.** `net:socket` (TCP client/server, UDP,
   event push) and `net:ssh` (SSH shell/exec, SFTP, TOFU host keys) are
   implemented with SDK 1.x aliases. Next: keyboard-interactive auth and SSH
   agent forwarding.
3. **Updater — done.** `tauri-plugin-updater` is wired with a signed feed; see
   [Releasing](release.md). `electron-updater` can be removed with `core/`.
4. **i18n and theming parity.** Port `core/renderer/i18n` and theme variables.
5. **Legacy removal.** Delete `core/`, `electron-builder.yml`, `build/`, and the
   Electron-era scripts once every tool is ported and the Marketplace has at
   least one release published from the new pipeline.

## Compatibility guarantees

- Existing plugin ids, entries, and permission strings keep working.
- Schema 1 manifests install with warnings (`legacy_sdk`), not errors.
- Existing `.zip` packages install unchanged as long as they carry a valid
  `manifest.json` and entry file.
- The SDK keeps the `callSdk`/`sdk` surface, so a plugin migration is usually an
  import change plus `manifest.sdkVersion = "2.0"`.

## Risks and mitigations

| Risk                                                   | Mitigation                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------- |
| WebView differences (WKWebView / WebView2 / WebKitGTK) | Per-platform smoke tests before release; avoid Chromium-only APIs           |
| Tool port regressions                                  | Port one tool at a time with its existing tests; keep a manual checklist    |
| Plugins relying on Electron-only behavior              | Keep the bridge wire format stable; log `capability.list` during migration  |
| Windows WebView2 availability                          | Tauri bundler ships the bootstrapper; document minimum Win 10 build         |
| Larger diff than one review                            | Migration proceeds capability-by-capability; legacy code stays until parity |

## Documentation tasks

- [x] `docs/zh-CN/architecture/overview.md`
- [x] `docs/zh-CN/architecture/marketplace.md`
- [x] `docs/zh-CN/architecture/security-model.md`
- [x] `docs/zh-CN/architecture/migration.md`
- [x] `docs/zh-CN/plugin-dev/marketplace-v2.md`
- [ ] Rewrite `docs/plugin-dev/guide.md` and `docs/plugin-dev/sdk.md` for SDK 2.0
- [x] Rewrite `docs/core-dev/architecture.md` to point here
- [ ] Update `docs/core-dev/installation-from-source.md` with the Rust toolchain

> 中文镜像：[docs/zh-CN/architecture/migration.md](../zh-CN/architecture/migration.md)
