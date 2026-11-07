# Changelog

All notable changes to DevToolBox are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and SemVer.

## Unreleased

### Changed

- Restored the main-branch layouts for all 27 built-in tools.
- Reworked Settings into a flat, grouped preferences page modeled on
  `ssh-hold-deck`: theme/language segmented controls, registry management,
  updates, and about in one scrolling view.

## 3.0.0 — Rust + Tauri 2 rewrite

### Added

- Rust workspace: `devtoolbox-contract`, `devtoolbox-capability`,
  `devtoolbox-market`, and the Tauri host in `apps/desktop/src-tauri`.
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
