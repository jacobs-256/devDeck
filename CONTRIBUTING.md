# Contributing to DevDeck

Thanks for helping. DevDeck is a Rust + Tauri 2 host with a React renderer and
an open plugin marketplace.

- **Setup and architecture:** [docs/development.md](docs/development.md)
- **Contribution workflow and checklist:** [docs/governance/contributing.md](docs/governance/contributing.md)
- **Plugin authoring:** [docs/plugin-dev/guide.md](docs/plugin-dev/guide.md)
- **Design system and shortcuts:** [docs/design-system.md](docs/design-system.md)

Quick gates before opening a pull request:

```bash
pnpm lint && pnpm typecheck && pnpm test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets
cargo test --workspace
```

Security issues must be reported privately; see [SECURITY.md](SECURITY.md).
