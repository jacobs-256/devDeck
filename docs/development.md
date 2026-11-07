# Development Guide

This is the secondary-development guide for the DevToolBox host: setup,
architecture, adding tools, adding host commands and plugin capabilities, UI
conventions, testing, and release.

## 1. Prerequisites

- Node.js 20+ and pnpm 10+
- Rust 1.90+ (`rustup` default toolchain)
- Platform Tauri prerequisites (Xcode command line tools on macOS, WebView2 /
  MSVC on Windows)

```bash
pnpm install
pnpm dev            # tauri dev (Vite + Rust host)
```

The first Rust build compiles the Tauri host and the three policy crates.

## 2. Repository map

| Path                           | Responsibility                                                           |
| ------------------------------ | ------------------------------------------------------------------------ |
| `apps/desktop/src`             | React renderer: legacy shell/pages, 27 tools, theme                      |
| `apps/desktop/src-tauri`       | Rust host: commands, plugin protocol, sockets, SSH, MQTT, certs, updater |
| `crates/devtoolbox-contract`   | Manifest, permissions, registry model, errors                            |
| `crates/devtoolbox-capability` | Capability broker, allowlists, path sandbox                              |
| `crates/devtoolbox-market`     | SHA-256/Ed25519, ZIP safety, install state                               |
| `packages/plugin-sdk`          | `@devtoolbox/plugin-sdk` 2.0 (published)                                 |
| `marketplace/`                 | Plugin workspace, scaffold, pack/sign/registry scripts                   |
| `scripts/`                     | Acceptance, updater rehearsal, legacy-import guard                       |
| `docs/`                        | English docs and `zh-CN` mirrors                                         |

## 3. Architecture in one page

```
Renderer (React)
  legacy pages ── tools (lazy chunks) ── PluginView (sandboxed iframe)
        │                                   │ postMessage
        ▼                                   ▼
Tauri commands ──────────────► plugin_sdk_call (single gated entry)
        │                                   │
        ▼                                   ▼
AppState ── sources/market ── capability broker ── path sandbox
        │                                   │
        └──────── Crates: contract / capability / market
```

- The renderer never touches the filesystem, sockets, or SSH directly. Built-in
  tools call explicit commands; plugins go through `plugin_sdk_call`.
- Every plugin call re-checks install state, enabled state, permission grant, and
  allowlists. Grants are rebuilt on enable/disable and uninstall.
- Plugin assets are served over `plugin://localhost/<id>/<entry>` with
  `connect-src 'none'` so plugin JS cannot bypass the broker.
- Marketplace state (sources, cached registries, installed plugins, grants) lives
  in the app data directory.

## 4. Running and debugging

```bash
pnpm dev                 # tauri dev
pnpm build               # frontend production build
pnpm typecheck
pnpm test
pnpm lint
cargo test --workspace
cargo clippy --workspace --all-targets
```

Debugging tips:

- Data directory: `~/Library/Application Support/com.devtoolbox.app` (macOS),
  `%APPDATA%\com.devtoolbox.app` (Windows).
- `settings.json` holds theme and language; `known-hosts.json` holds SSH TOFU
  pins; `logs/plugins.log` contains plugin diagnostics.
- Tauri dev exposes WebView devtools; production builds keep plugin CSP strict.
- `./scripts/marketplace-acceptance.sh market-emoji-search` builds, signs, serves,
  and installs a plugin through the real host path.
- `./scripts/updater-rehearsal.sh` builds updater artifacts and verifies the
  signature against the pinned public key.

## 5. Add a built-in tool

Built-in tool UIs are the components restored from the original main-branch
renderer under `apps/desktop/src/legacy-renderer/components/ModuleTools/`. They
use the shared `@@components` primitives so every tool keeps the legacy layout
(tool section headers, split panes, help modal, toolbar actions).

1. Create `legacy-renderer/components/ModuleTools/<Folder>/`:
   - `index.tsx` — default-exported component; root fills the tool area
   - `<Folder>.module.css` — layout styles
   - `locales/en.ts` — optional tool strings (`name`, button labels, help)
2. Use `ToolSection`, `useSplitPane`, `HelpModal`, `JsonTreeView`, or
   `useTextSearch` from `@@components` instead of bespoke chrome.
3. Register the tool in `apps/desktop/src/tools/registry.ts` with a lazy import,
   `id`, English search text, `nameKey`/`descriptionKey`, category, and keywords.
4. Map it to a sidebar category and icon in
   `apps/desktop/src/legacy/data.tsx` (`TOOL_CATEGORY`, `TOOL_ICONS`).
5. Add `tool.<id>.name` / `.desc` to both dictionaries in
   `apps/desktop/src/i18n/index.tsx`.
6. Privileged work goes through a Tauri command. The only `window.electronAPI`
   surface is the compatibility bridge in
   `legacy-renderer/compat/electron.ts`; extend it only when a restored tool
   needs another host call.

Tools are lazy-loaded chunks and stay mounted while switching tabs.

## 6. Add a host command

1. Implement the command in `apps/desktop/src-tauri/src/commands.rs`:
   ```rust
   #[tauri::command]
   pub fn my_command(state: State<'_, AppState>, value: String)
       -> Result<MyResult, DevToolboxError> { ... }
   ```
2. Register it in the `invoke_handler` list in `lib.rs`.
3. Add a typed wrapper in `apps/desktop/src/api.ts` and a type in `types.ts`.
4. Validate all inputs in Rust (lengths, schemes, paths, ranges). Never trust the
   renderer.
5. Add unit tests in the host module or the relevant crate. Prefer pure functions
   plus a command that composes them.

Commands are the only renderer→host surface; keep them coarse and typed.

## 7. Add a plugin capability

1. Add a `Permission` variant in `crates/devtoolbox-contract/src/permission.rs`
   (string form, summary, sensitivity, `is_implemented`).
2. Enforce allowlists in `crates/devtoolbox-capability/src/broker.rs` for the
   grant (`httpDomains`, env allowlist, reserved permissions).
3. Implement the operation in `apps/desktop/src-tauri/src/sdk.rs` and route it in
   the `plugin_sdk_call` dispatcher. This is the single gated entry for plugins.
4. Expose a typed method in `packages/plugin-sdk/src/index.ts` under `sdk.*`.
5. Update docs: `docs/plugin-dev/sdk.md`, `docs/architecture/security-model.md`,
   and the permission table in `docs/architecture/marketplace.md`.
6. Add tests on both sides: broker/capability tests in Rust, SDK behavior in the
   renderer or an acceptance plugin.

Reserved permissions (`bluetooth`, `serial`, `usb`) parse but report
`unimplemented_permission` until a host implementation exists.

## 8. UI rules

- The shell and pages under `apps/desktop/src/legacy/` intentionally match the
  original Electron layout: 180/52px sidebar, tools workspace with list panel and
  tabs, module center, settings secondary nav.
- Use the legacy tokens in `apps/desktop/src/theme/variables.css`; do not
  introduce new palettes or font scales. Plugins mirror the same tokens in
  `marketplace/shared/theme/`.
- Style page components with CSS modules (`*.module.css`). Tool internals use the
  scoped compatibility layer in `styles/tool-compat.css`.
- Preserve the shortcut contract: `Cmd/Ctrl+K`, `Cmd/Ctrl+,`, `Cmd/Ctrl+W`, `Esc`,
  search arrows/Enter, tool-specific `Cmd/Ctrl+F` (JSON/MQTT) and Enter
  (Ping/Tracert). See [design-system.md](design-system.md).
- Keep strings translatable: add keys to both dictionaries; never hardcode new
  English UI in components that already use `t()`.

## 9. Marketplace development

```bash
# Pack + sign one plugin
pnpm --filter @devtoolbox/marketplace pack market-my-plugin
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/my-key.txt) \
  pnpm --filter @devtoolbox/marketplace sign .local-dist/market-my-plugin-0.1.0.zip

# Local registry
pnpm --filter @devtoolbox/marketplace registry market-my-plugin \
  --base-url http://127.0.0.1:8765 --out .local-dist/registry.json
python3 -m http.server 8765 --directory marketplace/.local-dist
```

Add the URL in **Marketplace**; configure a pinned public key and signature
enforcement in **Settings → Registries → Trust options**.

Registry and package signatures use Ed25519; signatures are verified before
install, together with SHA-256 and ZIP safety checks. See
[marketplace.md](architecture/marketplace.md) and
[packaging.md](plugin-dev/packaging.md).

## 10. Testing and CI

| Layer           | Command                                                            |
| --------------- | ------------------------------------------------------------------ |
| Frontend/tools  | `pnpm test` (Vitest)                                               |
| TypeScript      | `pnpm typecheck`                                                   |
| Lint            | `pnpm lint` (manifests, legacy-import guard, ESLint)               |
| Rust            | `cargo test --workspace`, `cargo clippy --workspace --all-targets` |
| Formatting      | `cargo fmt --all -- --check`, `prettier --check`                   |
| Marketplace e2e | `pnpm marketplace:acceptance`                                      |
| Updater         | `pnpm release:rehearse`                                            |

CI runs the frontend pipeline on Ubuntu and the Tauri build/tests on Linux; the
release workflow builds macOS arm64 and Windows x64 artifacts.

## 11. Release

- App: tag `v<version>` (for example `v3.0.0`); the Tauri release workflow builds
  DMG/NSIS with updater artifacts and creates a draft release.
- Marketplace: tag `marketplace-v*`; the marketplace workflow packs, signs,
  verifies, and uploads `registry.json`, package ZIPs, and the public key.
- Required secrets: `TAURI_SIGNING_PRIVATE_KEY` (+ password) and
  `MARKETPLACE_SIGNING_KEY`.
- Full checklist: [release.md](architecture/release.md).

## 12. Pull-request checklist

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` pass.
- [ ] `cargo fmt --check`, `cargo clippy`, `cargo test --workspace` pass.
- [ ] New strings exist in both `en` and `zh-CN`.
- [ ] New permissions/commands are documented and covered by tests.
- [ ] UI changes follow the legacy layout and use theme tokens.
- [ ] Shortcuts still work (see design-system).
- [ ] No secrets, signed keys, or build artifacts are committed.
