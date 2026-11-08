# Changelog

All notable changes to DevDeck are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and SemVer.

## Unreleased

### Added

- Local `file://` registry and `.zip` package support for offline plugin
  development (development builds only; release builds use the official registry).
- Release builds hide custom registry inputs/removal and show only the official
  GitHub marketplace source; development builds retain the full registry tools.

### Fixed

- Tauri `{ code, message }` errors render as readable messages instead of
  `[object Object]`.
- JSON editors (JWT header/payload and the JSON formatter/converter editors)
  highlight syntax while typing.
- Tool pages now scroll when their content exceeds the available height
  (String Encryption, IP Calculator, RSA Key Pair Generator and the shared
  tool-section layouts).
- Traceroute and Ping output stream line by line instead of waiting for the
  whole run; Ping uses the native system ping command with a visible initial
  status.
- WebSocket tester server mode is implemented (start/stop, client list,
  broadcast/send, kick, status and log events); TLS is not supported yet.
- Removed the global card border/background from `<pre>` blocks so full-pane
  tool output no longer renders an inner framed box.

### Changed

- Adopted the **Aurora (Spectrum)** design system: deep indigo field, violet→cyan
  gradient, glass surfaces and 14–16px radii, in both light and dark themes. The
  previous zinc/emerald palette is superseded.
- Added `AGENTS.txt` as the mandatory UI standard for future modules, and
  mirrored the Aurora tokens into `marketplace/shared/theme`.
- Kept the legacy `ssh-hold-deck` layout structure while restyling the shell,
  dashboard, tools workspace, marketplace and settings.
- Restored the main-branch layouts for all 27 built-in tools.
- Reworked Settings into a flat, grouped preferences page modeled on
  `ssh-hold-deck`, with auto theme/language, text-size scaling, registry
  management, a loopback status service port, window close behavior, tray icon,
  and a footer about block with update / report / GitHub actions.

## 3.0.0 — Rust + Tauri 2 rewrite

### Added

- Rust workspace: `devdeck-contract`, `devdeck-capability`,
  `devdeck-market`, and the Tauri host in `apps/desktop/src-tauri`.
- Tauri 2 packaging for macOS (`.app`/`.dmg`) and Windows (NSIS), with signed
  updater artifacts and a `latest.json` feed.
- Open marketplace: registry sources, SHA-256 + Ed25519 verification, package
  and registry signatures, publish workflow, and an end-to-end acceptance script.
- Plugin SDK 2.0 with storage, HTTP, logging, files, sockets, SSH/SFTP, theme,
  system info, and a sandboxed iframe bridge. SDK 1.x aliases are preserved.
- 27 built-in tools ported to React/Rust, including Ping Test, MQTT, Tracert,
  WebSocket Tester, certificate tooling, and string encryption.
- Legacy Electron layout restored: sidebar navigation, dashboard, tool list +
  tabs workspace, module center, and settings secondary navigation.
- Bilingual UI (English/Simplified Chinese), dark/light themes, and keyboard
  shortcuts including `Cmd/Ctrl+K`, `Cmd/Ctrl+,`, `Cmd/Ctrl+W`, and tool-specific
  find/run shortcuts.
- Native Tauri menu (Settings, edit roles, theme, language, About).

### Changed

- The app now runs on the system WebView; the release DMG is about 5.5 MB.
- Plugin installation is registry-based; registry trust is configured in
  Settings → Registries.
- Documentation is split into users, plugin developers, and secondary
  development guides, with Chinese mirrors for architecture and plugin docs.

### Removed

- The Electron shell (`core/`), electron-builder configuration, and legacy
  tooling/scripts.
- Local ZIP/folder install commands from the UI; local development uses a local
  signed registry.

### Security

- Plugin documents run with `connect-src 'none'` and a strict CSP; all privileged
  access goes through `plugin_sdk_call`.
- SSH host keys are pinned (TOFU); file access is token-based; paths are sandboxed;
  HTTP is allowlisted per hop; packages are verified before extraction.
- Updater and marketplace artifacts are signed with independent keys.
