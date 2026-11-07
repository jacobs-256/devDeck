# Migration: Electron → Rust + Tauri 2

The rewrite landed on the `rust` branch in **3.0.0**. The Electron shell and
`core/` were removed; everything below is implemented in `apps/desktop`,
`crates/`, and `packages/plugin-sdk`.

## Status matrix

| Area                            | Electron (2.0.x)                   | Rust + Tauri (3.0.0)                                | State                   |
| ------------------------------- | ---------------------------------- | --------------------------------------------------- | ----------------------- |
| Shell & packaging               | electron-builder, ~239 MB `.app`   | Tauri 2, `bundle.targets = dmg/app/nsis`            | ✅ done                 |
| Manifest contract               | TS types in `electron-api.ts`      | `devtoolbox-contract` crate, schema v2 + v1 compat  | ✅ implemented & tested |
| Permission model                | ad-hoc checks in `marketplace.ts`  | `devtoolbox-capability` broker + allowlists         | ✅ implemented & tested |
| Package verification            | sha256 in Node script              | SHA-256 + Ed25519 in `devtoolbox-market`            | ✅ implemented & tested |
| Install/uninstall/enable        | `marketplace.ts` (3020 lines)      | `devtoolbox-market::store`                          | ✅ implemented & tested |
| Plugin asset serving            | Electron `BrowserWindow`           | `plugin://` custom protocol                         | ✅ implemented          |
| Plugin bridge                   | `postMessage` + 115 IPC calls      | `postMessage` + one gated `plugin_sdk_call`         | ✅ implemented          |
| SDK 1.x compatibility           | n/a                                | legacy method aliases + response shapes             | ✅ implemented & tested |
| Example plugins                 | SDK 1.x shim                       | six example plugins on SDK 2.0 (all build)          | ✅ migrated & built     |
| UI shell                        | Electron renderer                  | legacy layout restored in `apps/desktop/src/legacy` | ✅ visual parity        |
| Plugin scaffolding              | manual                             | `marketplace/scripts/create.mjs`                    | ✅ implemented          |
| Storage / logs / theme / opener | dedicated IPC channels             | SDK methods behind permissions                      | ✅ implemented          |
| HTTP proxy                      | `plugin:httpRequest`               | `http.rs` with per-hop allowlist                    | ✅ implemented          |
| SSH / SFTP / TCP / UDP          | `ssh2`, `net`                      | TCP/UDP + SSH shell/exec + SFTP + in-process e2e    | ✅ implemented & tested |
| File dialogs (`fs:dialog`)      | `dialog.showOpenDialog`            | token-based open/save + read/write + plugin data    | ✅ implemented & tested |
| Registry fetching               | HTTP fetch in main process         | source store + fetch + signature policy + install   | ✅ implemented & tested |
| Auto-update                     | `electron-updater`                 | `tauri-plugin-updater` + signed CI release          | ✅ implemented          |
| Built-in tools (27)             | React under `core/renderer`        | all 27 ported with model/host tests                 | ✅ done                 |
| i18n / themes                   | `core/renderer/i18n`, `theme`      | Shell, Marketplace, all 27 tool bodies translated   | ✅ done                 |
| Plugin author docs              | `docs/plugin-dev/*` (Electron era) | SDK 2.0 guide + scaffold + packaging docs           | ✅ done                 |

Legend: ✅ done and tested · 🟡 partial · ⬜ pending.

## What is runnable

```bash
# Rust crates + host
cargo test --workspace
cargo clippy --workspace --all-targets

# Renderer, SDK, tests
pnpm install
pnpm build
pnpm test
pnpm lint

# Desktop dev loop and packaging
pnpm dev
pnpm package:mac        # .app + .dmg
pnpm package:win        # NSIS, run on Windows

# Marketplace and updater rehearsals
pnpm marketplace:acceptance
pnpm release:rehearse
```

Measured on arm64 macOS (3.0.0):

| Artifact     | Electron 2.0.3 | Rust + Tauri 3.0.0 |
| ------------ | -------------- | ------------------ |
| `.app`       | 239 MB         | 8.35 MB            |
| `.dmg`       | 95 MB          | 5.46 MB            |
| Debug `.app` | —              | ~40 MB (no LTO)    |

## What remains (operational, not code)

1. **Publish app release** — push a `v3.0.0` tag after configuring
   `TAURI_SIGNING_PRIVATE_KEY` / `..._PASSWORD`; the workflow creates a signed
   draft release with updater artifacts.
2. **Publish marketplace** — push a `marketplace-v*` tag after configuring
   `MARKETPLACE_SIGNING_KEY`; the workflow packs, signs, verifies, and uploads
   `registry.json` + package ZIPs.
3. **Platform smoke** — macOS arm64 has been built and launched locally;
   Windows/macOS x64 paths run in the release matrix.

## Compatibility guarantees

- Existing plugin ids, entries, and permission strings keep working.
- Schema 1 manifests install with warnings (`legacy_sdk`), not errors.
- The SDK keeps the `callSdk`/`sdk` surface, so a plugin migration is usually an
  import change plus `manifest.sdkVersion = "2.0"`.

## Risks and mitigations

| Risk                                                   | Mitigation                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------------- |
| WebView differences (WKWebView / WebView2 / WebKitGTK) | Per-platform smoke tests before release; avoid Chromium-only APIs          |
| Plugins relying on Electron-only behavior              | Bridge wire format is stable; legacy SDK aliases stay in place             |
| Windows WebView2 availability                          | Tauri bundler ships the bootstrapper; document the minimum Win 10 build    |
| Updater or marketplace key loss                        | Keys live in CI secrets; rotation is documented in [Releasing](release.md) |

## Documentation tasks

- [x] `docs/zh-CN/architecture/*` mirrors
- [x] `docs/plugin-dev/guide.md` and `sdk.md` for SDK 2.0
- [x] Marketplace protocol, security model, release guide
- [x] Legacy removal completed (3.0.0)

> 中文镜像：[docs/zh-CN/architecture/migration.md](../zh-CN/architecture/migration.md)
