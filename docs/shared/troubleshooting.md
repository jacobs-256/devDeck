# Troubleshooting

## Requirements

- Node.js 20+, pnpm 10+
- Rust 1.90+ (`rustup`) and the platform Tauri prerequisites

## `pnpm install` fails or is slow

- Check connectivity to the npm registry and clear the store:

  ```bash
  pnpm store prune
  pnpm install
  ```

- Use the Node version from `.nvmrc`.

## `pnpm dev` fails before opening a window

- Confirm the Tauri prerequisites: Xcode command line tools on macOS, WebView2
  and MSVC build tools on Windows, and the WebKitGTK packages on Linux.
- Run `./cli.sh doctor` and `cargo check -p devdeck-desktop` to surface Rust
  errors.
- Delete `apps/desktop/src-tauri/gen/` and retry if the generated context is
  stale.

## `pnpm lint` passes in CI but fails locally

- Run `pnpm install` after switching branches (the lockfile may differ).
- `pnpm lint` includes marketplace manifest validation and the legacy-import
  guard; read the first failing check.

## Build or launch has no plugins / empty Marketplace

DevDeck adds the official GitHub registry on first launch. If it is missing,
add `https://github.com/jacobs-256/devToolBox/releases/download/marketplace/registry.json` in **Marketplace** and click **Refresh**.
Use HTTPS, or `http://localhost` / `http://127.0.0.1` for local testing. If a
local registry is not loading, confirm the Python/Node server is running and the
URL points at the JSON file.

## Install fails with `integrity_check_failed` / `signature_invalid`

- Refresh the registry: the ZIP may have been replaced without updating `sha256`.
- Re-sign the package after repacking; stale `.sig` files are rejected.
- If the source pins a public key, verify the registry and package signatures with
  `scripts/verify-updater-artifact.mjs` (packages) or `marketplace/scripts/sign.mjs
verify` (registry).

## Update check fails

- The updater only works in packaged builds, not in `pnpm dev`.
- Confirm GitHub Releases is reachable and `latest.json` exists for the newest
  published app release.
- Check that the updater public key in `tauri.conf.json` matches the signing key.

## SSH connection refused or host key changed

- DevDeck pins host keys in `known-hosts.json` on first use. A changed key is
  rejected with `permission_denied`; ask the user to forget the host before
  reconnecting.
- Password and OpenSSH key auth are supported; keyboard-interactive prompts are
  not implemented.

## Shortcuts do not respond

- `Cmd/Ctrl+K` and `Cmd/Ctrl+,` are handled by the shell; ensure the app window
  has focus.
- `Cmd/Ctrl+W` only closes a tool tab when one is active.
- `Cmd/Ctrl+F` is tool-specific (JSON Formatter, MQTT).

## Where are logs and data?

- macOS: `~/Library/Application Support/com.devdeck.desktop`
- Windows: `%APPDATA%\com.devdeck.desktop`

Useful files: `settings.json`, `marketplace-state.json`,
`marketplace-sources.json`, `known-hosts.json`, `logs/plugins.log`.

## Packaging on the wrong OS

Tauri builds are per-OS. Use `pnpm package:mac` on macOS and `pnpm package:win`
on Windows, or let `.github/workflows/tauri-release.yml` build both.
