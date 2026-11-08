# User Guide

DevDeck is a desktop toolbox with 27 built-in utilities and an open plugin
marketplace. This guide covers the interface, plugins, settings, and shortcuts.

## Install

Download the latest installer from
[GitHub Releases](https://github.com/jacobs-256/devToolBox/releases):

- **macOS** — open the DMG and drag DevDeck into Applications.
- **Windows** — run the NSIS installer (x64).

The app is built with Tauri 2 and uses the system WebView, so the download is
about 5.5 MB.

## Interface

The app uses the same layout as the original DevDeck:

- **Sidebar** — Dashboard, Tools, Marketplace, Settings. Use the footer button to
  collapse it to an icon rail.
- **Dashboard** — search, category shortcuts, frequently used tools, and app,
  screen, and runtime information.
- **Tools** — a tool list panel on the left and a tabbed workspace on the right.
- **Marketplace** — registry sources, installed plugins, and available plugins.
- **Settings** — appearance, language, registries, updates, and about.

## Tools

1. Open **Tools** and pick a category in the sidebar, or search in the tool list.
2. Click a tool to open it in a tab.
3. Open as many tools as you like; tabs keep their state when you switch.
4. Close a tab with its `×`, with the tab menu → **Close All**, or `Cmd/Ctrl+W`.
5. Use the fullscreen button in the tool header for a distraction-free view
   (`Esc` exits).

All built-in tools run locally. Network tools (Ping Test, MQTT, Tracert,
WebSocket) and certificate tools never send data to a third-party service.

## Marketplace

Plugins are small web apps that run in a sandboxed iframe. They can only use the
capabilities declared in their manifest, and every privileged call is checked by
the Rust host.

### Default registry

DevDeck ships with the official GitHub registry as the default source:

```text
https://github.com/jacobs-256/devToolBox/releases/download/marketplace/registry.json
```

It is added once on first launch. Use **Refresh** to reload the catalog.

Release builds use this official registry only. **Development builds** additionally
show the registry input, **Add registry**, and **Trust options** for local
`file://` or loopback registries. Registry URLs must be HTTPS in production. `http://localhost`, `http://127.0.0.1`, and local
`file:///…/registry.local.json` URLs are allowed for local development.

For a signed registry, open **Settings → Registries → Trust options**, paste the
registry's Ed25519 public key, and optionally require signatures before adding
the URL.

### Install, update, remove

- **Marketplace tab** — click **Install** (or **Upgrade** when a newer version is
  available).
- **Installed tab** — update all plugins from the banner, toggle a plugin on or
  off, or remove it with the trash button.
- Disabling a plugin revokes its grants; re-enabling re-issues them from the
  manifest.

Plugin data is stored in the app data directory and survives updates.

## Settings

- **General** — dark/light theme and English/Simplified Chinese language. Both
  are saved to `settings.json` and restored on startup.
- **Registries** — add/remove registry sources and configure the Ed25519 trust
  options described above.
- **Updates** — check for a new DevDeck release. Updates are downloaded from
  GitHub Releases and verified with the update signing key.
- **About** — version, platform, and data directory.

## Keyboard shortcuts

| Shortcut                          | Action                                                 |
| --------------------------------- | ------------------------------------------------------ |
| `Cmd/Ctrl+K`                      | Global tool search                                     |
| `Cmd/Ctrl+,`                      | Open Settings                                          |
| `Cmd/Ctrl+W`                      | Close the active tool tab                              |
| `Esc`                             | Close search/dialog, exit fullscreen                   |
| `↑` / `↓` / `Enter`               | Navigate and open search results                       |
| `Cmd/Ctrl+F`                      | JSON Formatter: find in output · MQTT: filter messages |
| `Enter`                           | Ping Test: probe · Tracert: trace                      |
| `Cmd/Ctrl+C/V/X/A`                | Copy / paste / cut / select all                        |
| `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` | Undo / redo                                            |
| `Cmd+Q`                           | Quit (macOS)                                           |
| `Tab` / `Shift+Tab`               | Move focus                                             |

## Data and privacy

- Data directory: `~/Library/Application Support/com.devdeck.desktop` (macOS) or
  `%APPDATA%\com.devdeck.desktop` (Windows).
- The app does not send telemetry. Built-in tools are local-only; plugins only
  reach the network if their manifest declares `http:*` or `net:*` and you
  install them.
- Plugin logs are written to `logs/plugins.log` for diagnostics.

## Report an issue

Use [GitHub Issues](https://github.com/jacobs-256/devToolBox/issues) and
include the version, OS/architecture, steps to reproduce, and screenshots or log
excerpts. For security reports, follow the [Security Policy](../governance/security.md).
