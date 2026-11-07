# Removing the legacy Electron tree

Status: **ready, not executed.** The Tauri app, plugin SDK, and marketplace
modules have no dependency on `core/` or Electron; the guard below enforces it
in CI. Deletion is a mechanical cleanup that can happen whenever the maintainers
decide the old shell is no longer needed as a reference.

## Guard

```bash
pnpm lint:legacy
```

`scripts/check-legacy-imports.mjs` scans `apps/desktop/src`,
`apps/desktop/src-tauri/src`, `packages/plugin-sdk/src`, and
`marketplace/modules` for imports of `core/…` or `electron`. It runs as part of
`pnpm lint` and fails CI on any regression.

## Inventory

| Path                                                                                                                               | Contains                                                  | Replaced by                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `core/`                                                                                                                            | Electron main/preload, React renderer, 27 legacy tools    | `apps/desktop/`, `crates/`, `packages/plugin-sdk/`                              |
| `build/`                                                                                                                           | Electron icons and entitlements                           | `apps/desktop/src-tauri/icons/`, `tauri.conf.json`                              |
| `electron-builder.yml`                                                                                                             | Electron packaging config                                 | `apps/desktop/src-tauri/tauri.conf.json`, `.github/workflows/tauri-release.yml` |
| `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.eslint.json`                                | Legacy renderer build/test/typecheck with `core/` aliases | `apps/desktop/{vite,tsconfig,vitest}.config.*`, root `typecheck`                |
| `scripts/new-tool.mjs`, `scripts/lint-modules.mjs`, `scripts/exec-without-node-options.mjs`, `scripts/prune-broken-pnpm-links.mjs` | Legacy tooling                                            | `apps/desktop/src/tools/`, `pnpm lint:legacy`                                   |
| `dist/`, `dist-electron/`, `release/`                                                                                              | Generated Electron artifacts                              | `target/release/bundle/`                                                        |
| `docs/core-dev/`                                                                                                                   | Electron architecture docs                                | `docs/architecture/`                                                            |
| `cli.sh` Electron branches                                                                                                         | dev/build/package commands                                | `pnpm dev`, `pnpm package:*` (already switched)                                 |

`marketplace/`, `docs/architecture/`, `docs/plugin-dev/`, and `design/` stay.

## Procedure

1. Confirm the guard and the current gates pass:

   ```bash
   pnpm lint:legacy
   pnpm test
   pnpm build
   cargo test --workspace
   ```

2. Remove the tree and generated directories:

   ```bash
   git rm -r core build dist dist-electron release docs/core-dev
   git rm electron-builder.yml vite.config.ts vitest.config.ts \
     tsconfig.json tsconfig.node.json tsconfig.eslint.json \
     scripts/new-tool.mjs scripts/lint-modules.mjs \
     scripts/exec-without-node-options.mjs scripts/prune-broken-pnpm-links.mjs
   ```

3. Trim `package.json`:
   - delete `legacy:*`, `new:tool`, `lint:modules`, `prune:pnpm-links`
   - keep `lint-marketplace` (validates `marketplace/modules`) as
     `pnpm --dir marketplace lint`
   - point `test` at `pnpm --filter @devtoolbox/desktop test` and delete the root
     Vitest config with the legacy aliases
   - remove Electron-only dependencies (`electron`, `electron-builder`,
     CodeMirror, legacy React tooling) after checking `pnpm why` for shared use
   - remove the `postinstall` Electron rebuild

4. Drop the **Legacy Electron build** step from `.github/workflows/ci.yml`.

5. Document cleanup: remove `core-dev/*` from `docs-site/mkdocs.yml`, the README
   `legacy:*` section, and the `core/` row in
   [overview](overview.md#repository-map).

6. Verify:

   ```bash
   pnpm install
   pnpm lint
   pnpm typecheck
   pnpm build
   pnpm test
   cargo fmt --all -- --check && cargo clippy --workspace --all-targets
   cargo test --workspace
   pnpm package:mac
   ./scripts/marketplace-acceptance.sh market-emoji-search
   ```

   Then launch the release binary and open one built-in tool and one installed
   plugin.

## Why not delete now?

`core/` is still useful as a behavioural reference for edge cases in the ported
tools, and deleting it is irreversible. The objective is met without it: no new
code imports it, CI keeps it merely compiling, and every feature has a Tauri
implementation with tests.
