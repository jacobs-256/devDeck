# FAQ (Users)

## Marketplace

### The Marketplace is empty

DevDeck adds the official GitHub registry on first launch:

```text
https://github.com/XthingsJacobs/devToolBox/releases/download/marketplace/registry.json
```

If the list is empty:

1. Open **Marketplace** and click **Refresh**.
2. Check your network access to GitHub Releases.
3. Development builds can add custom registries with **Add registry**; release
   builds use the official registry only.

For local development, `http://localhost`, `http://127.0.0.1`, and local
`file:///…/registry.local.json` URLs are accepted; everything else must be HTTPS.

### Install fails with “Only https is allowed”

Registry and download URLs must be `https://`. Loopback (`http://localhost`,
`http://127.0.0.1`) and local `file://` registries/packages are allowed only for
local development.

### Install fails with a signature or digest error

The package did not match its registry entry. Possible causes:

- the author republished a ZIP without updating `sha256`;
- the registry is stale (click **Refresh**);
- a source with a pinned public key served an unsigned or tampered package.

Ask the registry author to regenerate and re-sign the release.

### How do I verify a registry is signed?

Open **Settings → Registries → Trust options**, paste the registry's Ed25519
public key, and enable **Reject this registry unless its signature verifies**.
Without a key, packages are still checked against their SHA-256 digest.

### Where do plugins run?

Plugins are web apps in a sandboxed iframe served from the `plugin://` protocol.
They cannot access the filesystem, network, or SSH directly; every privileged
call is permission-checked by the Rust host. The plugin CSP blocks direct
network connections.

### Can I use DevDeck offline?

Yes. All 27 built-in tools work offline. Marketplace actions and plugin network
features need connectivity only when their manifests declare it.

## Updates

### How do I check for updates?

Open **Settings → Updates** and click **Check for updates**. The app downloads
from GitHub Releases and verifies the updater signature before installing.

### The update check does nothing

- Make sure you are using a packaged build (the updater is not active in a plain
  browser preview).
- Check connectivity to GitHub Releases.
- Restart the app and try again.

There is no background auto-check toggle in 3.0.0; updates are checked manually.

## Appearance and language

### Where are theme and language saved?

Both are stored in `settings.json` in the app data directory and restored on
startup. Use **Settings → General** to change them.

### Why do some labels stay in English?

The shell, pages, and all 27 tools are translated. Technical protocol tokens
(MQTT statuses, WebSocket states, certificate fields) intentionally remain in
English.

## Data

### Where is my data?

- macOS: `~/Library/Application Support/com.devdeck.desktop`
- Windows: `%APPDATA%\com.devdeck.desktop`

It contains `settings.json`, `marketplace-state.json`, `marketplace-sources.json`,
plugins, plugin storage, logs, and `known-hosts.json`.

### How do I reset the app?

Quit DevDeck and remove the data directory (or just `settings.json` for
appearance/language). This deletes installed plugins and plugin storage.

## Shortcuts

See the table in the [User Guide](guide.md#keyboard-shortcuts). The most common
ones are `Cmd/Ctrl+K` (search), `Cmd/Ctrl+,` (settings), and `Cmd/Ctrl+W` (close
tool tab).

## Support

Include the version, OS/architecture, steps to reproduce, and screenshots or log
excerpts in [GitHub Issues](https://github.com/XthingsJacobs/devDeck/issues).
For security issues, follow the [Security Policy](../governance/security.md).
