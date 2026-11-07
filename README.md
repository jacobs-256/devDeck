# DevToolBox

A plugin-first desktop toolbox for developers: 27 built-in utilities, a signed
plugin marketplace, and a Rust host packaged with **Tauri 2** for macOS and
Windows.

- **Small footprint** — ~5.5 MB DMG instead of ~95 MB with the old Electron shell.
- **Secure by design** — plugins run in a sandboxed iframe with a strict CSP and
  reach privileged capabilities only through a permission broker.
- **Open marketplace** — registry sources, Ed25519 package and registry
  signatures, and documented authoring/publishing steps.
- **Bilingual UI** — English and Simplified Chinese, dark and light themes.
- **Legacy layout** — the sidebar, tool workspace, tabs, dashboard, marketplace,
  and settings screens match the original Electron application.

## Install

Download the latest release from
[GitHub Releases](https://github.com/XthingsJacobs/devToolBox/releases):

- **macOS** — open the DMG and drag DevToolBox into Applications.
- **Windows** — run the NSIS installer.

Updates are verified with the updater signing key and can be checked from
**Settings → Updates**.

## Built-in tools (27)

| Category  | Tools                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| Developer | JSON Formatter, JSON ↔ YAML, JSON ↔ XML, HTML Editor, JS Formatter, Regex Tester, UUID Generator             |
| Text      | Base64, URL Codec, Unicode Inspector, Pinyin Converter, QR Code, Wi-Fi QR, Markdown Preview, Text Diff       |
| Network   | IP Calculator, Ping Test, MQTT Client, Tracert, WebSocket Tester                                             |
| Security  | Key Pair, CA Generator, CSR Generator, Issue Certificate, Certificate Viewer, JWT Decoder, String Encryption |

All tools run locally. Network and certificate operations are implemented in
Rust (TCP handshake, MQTT client, certificate generation/parsing, SSH/SFTP) or
in the renderer (WebSocket, downloads), never through remote services.

## Marketplace

Plugins are self-contained web apps served by the host over `plugin://` and
rendered in an iframe. Every capability is declared in `manifest.json` and
enforced by the Rust broker.

- Authoring guide: [plugin-dev/marketplace-v2.md](docs/plugin-dev/marketplace-v2.md)
- Protocol: [architecture/marketplace.md](docs/architecture/marketplace.md)
- SDK: [plugin-dev/sdk.md](docs/plugin-dev/sdk.md)
- Packaging and signing: [plugin-dev/packaging.md](docs/plugin-dev/packaging.md)

Quick flow:

```bash
# Scaffold (manifest + Vite + SDK demo)
node marketplace/scripts/create.mjs --id market-my-tool --name "My Tool"

# Build, pack, sign
pnpm --filter @devtoolbox/plugin-market-my-tool build
pnpm --filter @devtoolbox/marketplace pack market-my-tool
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/my-key.txt) \
  pnpm --filter @devtoolbox/marketplace sign .local-dist/market-my-tool-0.1.0.zip

# Local registry + serve
pnpm --filter @devtoolbox/marketplace registry market-my-tool \
  --base-url http://127.0.0.1:8765 --out .local-dist/registry.json
python3 -m http.server 8765 --directory marketplace/.local-dist
```

Then add `http://127.0.0.1:8765/registry.json` in **Marketplace** and install the
plugin. `scripts/marketplace-acceptance.sh` automates the full signed flow.

## Get started (contributors)

Requirements: Node.js 20+, pnpm 10+, Rust 1.90+ with the platform Tauri
prerequisites.

```bash
pnpm install
pnpm dev            # Tauri 2 desktop app
pnpm build          # renderer + plugin SDK production build
pnpm test           # renderer/tool tests
cargo test --workspace
```

Common commands:

| Command                            | Runs                                                  |
| ---------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                         | `tauri dev` for `apps/desktop`                        |
| `pnpm build`                       | renderer production build + SDK build                 |
| `pnpm typecheck`                   | renderer and SDK TypeScript checks                    |
| `pnpm test`                        | Vitest for renderer and tools                         |
| `pnpm lint`                        | manifestation validation, legacy-import guard, ESLint |
| `pnpm package:mac` / `package:win` | Tauri installers for the host OS                      |
| `pnpm marketplace:acceptance`      | end-to-end signed marketplace rehearsal               |
| `pnpm release:rehearse`            | updater artifact + `latest.json` rehearsal            |

The Rust workspace:

```bash
cargo test --workspace
cargo clippy --workspace --all-targets
cargo fmt --all -- --check
```

## Keyboard shortcuts

| Shortcut                         | Action                                                 |
| -------------------------------- | ------------------------------------------------------ |
| `Cmd/Ctrl+K`                     | Global tool search                                     |
| `Cmd/Ctrl+,`                     | Settings                                               |
| `Cmd/Ctrl+W`                     | Close the active tool tab                              |
| `Esc`                            | Close search/dialog, exit tool fullscreen              |
| `↑` / `↓` / `Enter`              | Navigate and open search results                       |
| `Cmd/Ctrl+F`                     | JSON Formatter: find in output · MQTT: filter messages |
| `Enter`                          | Ping Test: probe · Tracert: trace                      |
| `Cmd/Ctrl+C/V/X/A`, `Cmd/Ctrl+Z` | Native edit roles                                      |
| `Cmd+Q`                          | Quit (macOS)                                           |

The native menu also exposes Settings, theme, language, and About. See
[design-system.md](docs/design-system.md) for the full UI specification.

## Repository layout

```text
devtoolbox/
├── apps/desktop/                 Tauri app (React renderer + src-tauri host)
│   ├── src/legacy/               Restored main-branch shell and pages
│   ├── src/tools/               27 built-in tools + registry/tests
│   ├── src/theme/               Legacy color/type tokens and globals
│   └── src-tauri/               Rust host, plugin protocol, commands
├── crates/                      Rust workspace
│   ├── devtoolbox-contract/     Manifest, permissions, registry, errors
│   ├── devtoolbox-capability/   Broker, allowlists, path sandbox
│   └── devtoolbox-market/       SHA-256/Ed25519, ZIP safety, install state
├── packages/plugin-sdk/         Published @devtoolbox/plugin-sdk (2.0)
├── marketplace/                 Plugin workspace + pack/sign/registry tooling
├── scripts/                     Acceptance, updater rehearsal, guards
├── docs/                        Documentation (English + 中文)
├── docs-site/                   MkDocs configuration
├── .github/workflows/           CI, Tauri release, marketplace release
├── Cargo.toml                   Rust workspace
├── cli.sh                       Repository CLI helpers
└── pnpm-workspace.yaml
```

## Documentation

- [Documentation index](docs/index.md)
- [Architecture](docs/architecture/overview.md)
- [Development guide](docs/development.md) — secondary development, adding tools,
  commands, capabilities, and tests
- [Design system](docs/design-system.md)
- [Marketplace protocol](docs/architecture/marketplace.md)
- [Security model](docs/architecture/security-model.md)
- [Migration record](docs/architecture/migration.md)
- [Releasing](docs/architecture/release.md)
- [中文文档](docs/zh-CN/README.md)

## Contributing

- [Contributing](CONTRIBUTING.md) · [detailed workflow](docs/governance/contributing.md)
- [Code of conduct](CODE_OF_CONDUCT.md)
- [Security policy](SECURITY.md)
- [Roadmap](docs/governance/roadmap.md)

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](docs/NOTICE).
