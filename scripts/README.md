# Repository Scripts

Scripts used by development, CI, and release workflows.

## Marketplace and release

- `lint-marketplace.mjs` — validates every `marketplace/modules/*/manifest.json`
  (required fields, permission strings, entry file).
- `marketplace-acceptance.sh` — builds a plugin, packs and signs it with a
  throwaway key through the release pipeline, serves the artifacts on loopback,
  and installs them through the host (`pnpm marketplace:acceptance`).
- `updater-rehearsal.sh` — builds updater artifacts with the real signing key,
  verifies the minisign signature against the pinned public key, and writes a
  `latest.json` draft (`pnpm release:rehearse`).
- `verify-updater-artifact.mjs` — standalone minisign verifier used by the
  rehearsal script (supports `Ed` and `ED` modes).

## Architecture guard

- `check-legacy-imports.mjs` — fails if the Tauri app, SDK, or marketplace
  modules import `core/` or Electron (`pnpm lint:legacy`, part of `pnpm lint`).

## Usage

```bash
pnpm lint:manifests          # validate marketplace module manifests
pnpm lint:legacy             # ensure the new architecture stays decoupled
pnpm marketplace:acceptance  # signed end-to-end marketplace rehearsal
pnpm release:rehearse        # updater artifact + latest.json rehearsal
```
