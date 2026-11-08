# Contributing

Thanks for contributing to DevDeck. The app is a Rust + Tauri 2 host with a
React renderer and an open plugin marketplace.

## Development environment

- Node.js 20+, pnpm 10+
- Rust 1.90+ with the platform Tauri prerequisites
- macOS, Windows, or Linux for development; packaging must run on the target OS

## Run locally

```bash
pnpm install
pnpm dev            # tauri dev
```

See the [development guide](../development.md) for architecture and debugging.

## Quality gates

```bash
pnpm lint           # manifests, legacy-import guard, ESLint
pnpm typecheck
pnpm test
pnpm build

cargo fmt --all -- --check
cargo clippy --workspace --all-targets
cargo test --workspace
```

Optional end-to-end checks:

```bash
pnpm marketplace:acceptance
pnpm release:rehearse
```

## Pull requests

- Base branch: `main`.
- Fork `main`, create a focused feature branch, and open the PR against `main`.
- Keep each PR to one feature, refactor, or bug fix.
- Add tests for behavior changes; UI changes should include screenshots.
- Update the English docs and the `docs/zh-CN` mirror when behavior changes.
- Never commit secrets, `.signing/`, or build artifacts.

## Add a built-in tool

1. Add `module-tools/<tool>/<Tool>.tsx`, a pure model, and Vitest tests.
2. Register it in `apps/desktop/src/tools/registry.ts` with i18n keys,
   category, and keywords.
3. Map the category/icon in `apps/desktop/src/legacy/data.tsx`.
4. Add `tool.<id>.name` / `.desc` (and UI keys) to both dictionaries.
5. Use a Rust command for files, network, or SSH — never direct host access.

Full steps: [development guide §5](../development.md#5-add-a-built-in-tool).

## Add a marketplace plugin

```bash
node marketplace/scripts/create.mjs --id market-my-tool --name "My Tool"
```

- [Plugin developer guide](../plugin-dev/guide.md)
- [SDK 2.0 authoring](../plugin-dev/marketplace-v2.md)
- [Packaging and signing](../plugin-dev/packaging.md)

## Documentation

- [Documentation index](../index.md)
- [Architecture](../architecture/overview.md)
- [Design system](../design-system.md)
- [中文文档](../zh-CN/README.md)
