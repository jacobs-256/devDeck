# Contributing

Thanks for contributing to DevToolBox.

## Development Environment

- Node.js 20+
- macOS / Windows / Linux are supported for development (packaging requires the target OS)

## Run Locally

```bash
pnpm install
pnpm dev
```

## Quality Gates

```bash
pnpm lint
pnpm lint:modules
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

## PR Guidelines

- Base branch: `dev`
- Workflow: fork from `dev` → create feature branch → open PR back to `dev`
- Keep each PR focused (one feature / one refactor / one bug fix).
- Do not commit secrets (tokens, private keys, certificates).
- For UI changes, include screenshots or screen recordings when possible.

## Add a Built-in Tool

Built-in tools live in `apps/desktop/src/tools/`:

1. Add `<tool>/<Tool>.tsx` and a pure model (`*.model.ts`) with Vitest tests
   under `module-tools/`.
2. Register it in `apps/desktop/src/tools/registry.ts` (id, name, description,
   category, i18n keys, component).
3. Add `tool.<id>.name` / `tool.<id>.desc` to both dictionaries in
   `apps/desktop/src/i18n/index.tsx`.
4. If the tool needs privileges, call a Rust command — never reach for the
   network or filesystem directly.

References:

- [Architecture overview](../architecture/overview.md)
- [Security model](../architecture/security-model.md)
- [Built-in tools registry](../../apps/desktop/src/tools/registry.ts)

## Add a Marketplace Plugin

Use the scaffold, then follow the authoring guide:

```bash
node marketplace/scripts/create.mjs --id market-my-tool --name "My Tool"
```

- [Plugin developer guide](../plugin-dev/guide.md)
- [SDK 2.0 authoring](../plugin-dev/marketplace-v2.md)
