# DevToolBox — Plugin-first, all-in-one Desktop Toolbox

[![CI](https://github.com/XthingsJacobs/devToolBox/actions/workflows/ci.yml/badge.svg?branch=dev)](https://github.com/XthingsJacobs/devToolBox/actions/workflows/ci.yml)
[![CodeQL](https://github.com/XthingsJacobs/devToolBox/actions/workflows/codeql.yml/badge.svg?branch=dev)](https://github.com/XthingsJacobs/devToolBox/actions/workflows/codeql.yml)
![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)

DevToolBox is a cross-platform desktop toolbox built with **Rust + Tauri 2** on the host and **React + TypeScript + Vite** in the UI.

It aims to be a plugin-first, all-in-one workspace for everyday developer utilities:

- Built-in tool modules: formatter, codec, crypto, network, MQTT, JWT, diff, etc.
- Marketplace plugins: install, update, and build your own tools as plugins
- One app, one search, one workspace: keep common utilities together instead of scattered scripts

## Get Started (Users)

- Download: https://github.com/XthingsJacobs/devToolBox/releases
- Install plugins: Modules → Marketplace → Refresh → Install
- User docs: [docs/index.md](./docs/index.md) → [users/guide.md](./docs/users/guide.md)

- **Bilingual UI** — English and Simplified Chinese across the shell, Marketplace, and all 27 tools
- **Plugin marketplace** — signed registries, consent screen, developer folder install

## Featured Tools

Built-in tool modules worth trying first (Rust + Tauri branch):

- Base64 / Base64URL codec
- JSON formatter, minifier, and key sorter
- JWT decoder with expiry checks
- IPv4 / CIDR calculator
- Regex tester with groups and replace
- UUID v4 / v7 generator
- URL percent-encoder and query parser
- Markdown preview with sanitized rendering
- Text diff by line/word/character with unified patch
- QR code generator (SVG)
- JSON ↔ YAML / JSON ↔ XML converters
- Unicode inspector (escape, code point, UTF-8/16 sizes)
- Pinyin converter with tone marks, numbers, and initials
- Wi-Fi QR code builder
- Key pair / CA / CSR / certificate issuance and viewer (Rust `rcgen` + `x509-parser`)
- HTML editor with sandboxed preview
- JS beautifier/minifier (terser loaded on demand)
- AES-256-GCM string encryption
- TCP ping (handshake latency) and WebSocket tester
- MQTT client (subscribe/publish with live log)
- Traceroute (OS `traceroute`/`tracert`, validated host)

Marketplace plugins in this repo (examples):

- `market-ip-lookup`: IP geolocation lookup with multi-provider fallback
- `market-exchange-rate`: FX rates + currency conversion
- `market-matter-catalog`: Matter device type → cluster requirements lookup

## Architecture

The application is split into a thin web layer and a Rust policy layer:

| Path                           | Role                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `apps/desktop/src`             | React shell, built-in tools, plugin bridge                 |
| `apps/desktop/src-tauri`       | Tauri host: commands, SDK dispatcher, `plugin://` protocol |
| `crates/devtoolbox-contract`   | Manifest, permission, registry, and error contracts        |
| `crates/devtoolbox-capability` | Capability broker, HTTP allowlists, path sandbox           |
| `crates/devtoolbox-market`     | Package verification (SHA-256 + Ed25519), install state    |
| `packages/plugin-sdk`          | `@devtoolbox/plugin-sdk` for Marketplace plugin authors    |

Every plugin capability flows through **one gated command**
(`plugin_sdk_call`); the host re-checks the installed manifest, enablement, and
the specific permission on every call.

Read more:

- [Architecture overview](./docs/architecture/overview.md)
- [Design system](./docs/design-system.md)
- [Marketplace protocol](./docs/architecture/marketplace.md)
- [Security model](./docs/architecture/security-model.md)
- [Migration status](./docs/architecture/migration.md)

## Get Started (Contributors)

Requirements:

- Node.js 20+
- pnpm 10+
- Rust 1.90+ (`rustup` default toolchain) with the platform Tauri prerequisites

Run the Tauri app locally:

```bash
pnpm install
pnpm dev            # Tauri 2 desktop app
pnpm build          # renderer + plugin SDK production build
pnpm test           # host + renderer unit tests
```

Run the policy crates and their tests:

```bash
cargo test -p devtoolbox-contract -p devtoolbox-capability -p devtoolbox-market
cargo clippy --workspace --all-targets
```

Contributor docs:

- [Architecture overview](./docs/architecture/overview.md)
- [Design system](./docs/design-system.md)
- [Security model](./docs/architecture/security-model.md)
- [Built-in tools registry](./apps/desktop/src/tools/registry.ts)
- CLI: [shared/cli.md](./docs/shared/cli.md)
- Troubleshooting: [shared/troubleshooting.md](./docs/shared/troubleshooting.md)

Quality gates:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets
cargo test --workspace
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Packaging (Tauri 2):

```bash
# macOS .app + .dmg
pnpm package:mac

# Windows NSIS installer (run on Windows)
pnpm package:win
```

Artifacts land in `target/release/bundle/`; the release `.dmg` is about **5.4 MB**
on macOS arm64.

Releases are produced by `.github/workflows/tauri-release.yml` with signed
updater artifacts; see [Releasing](docs/architecture/release.md). In-app updates
live in **Settings → Updates**.

## Plugin Development (Marketplace)

A plugin is a self-contained web UI that runs in a sandboxed iframe and reaches
the host only through `@devtoolbox/plugin-sdk`. Every capability is declared in
`manifest.json` and enforced by the Rust capability broker.

- Authoring guide: [marketplace-v2.md](./docs/plugin-dev/marketplace-v2.md)
- Protocol spec: [marketplace.md](./docs/architecture/marketplace.md)
- SDK package: [`packages/plugin-sdk`](./packages/plugin-sdk/README.md)

Quick flow:

```bash
# Scaffold a new plugin (manifest + Vite + SDK demo)
pnpm --filter @devtoolbox/marketplace create --id market-<id> --name "My Tool"

# Build the plugin web app
pnpm --filter ./marketplace/modules/market-<id> build

# Package (+ sign) into marketplace/.local-dist
pnpm --filter @devtoolbox/marketplace pack market-<id>
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/key.txt) \
  pnpm --filter @devtoolbox/marketplace sign .local-dist/market-<id>-<version>.zip

# Generate registry.json
pnpm --filter @devtoolbox/marketplace registry --all --out release-dist/registry.json
```

Then open **Marketplace**, add the URL of your `registry.json` in the registry
bar, and install from the catalog.

## Contributing

- Contributing guide: [contributing.md](./docs/governance/contributing.md)
- Roadmap: [roadmap.md](./docs/governance/roadmap.md)
- Built-in tools: [`apps/desktop/src/tools`](./apps/desktop/src/tools)
- Code of conduct: [code-of-conduct.md](./docs/governance/code-of-conduct.md)
- Security policy: [security.md](./docs/governance/security.md)
- Support: [support.md](./docs/governance/support.md)

## Repository Layout

```text
devtoolbox/
├── apps/desktop/                      Tauri 2 app (React renderer + src-tauri host)
├── crates/                            Rust workspace: contract, capability, market
├── packages/plugin-sdk/               Published @devtoolbox/plugin-sdk
├── marketplace/                       Plugin workspace + pack/sign/registry tooling
├── scripts/                           Dev, acceptance, and release helpers
├── docs/                              Documentation source (MkDocs)
├── docs-site/                         MkDocs site config
├── .github/                           CI / release workflows
├── Cargo.toml                         Rust workspace
├── cli.sh                             Repo CLI helpers
├── package.json
└── pnpm-workspace.yaml
```

## License

Apache-2.0
