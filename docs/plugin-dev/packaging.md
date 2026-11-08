# Packaging and Signing

Marketplace artifacts are built from `marketplace/` and published as a signed
`registry.json` plus signed ZIP packages.

## 1. Naming

- `manifest.id` must be kebab-case and start with `market-`.
- Workspace package: `@devdeck/plugin-<manifest.id>`.
- Package file: `<manifest.id>-<version>.zip`.

## 2. Build

```bash
# Scaffold
node marketplace/scripts/create.mjs --id market-my-tool --name "My Tool"

# Build the plugin web app (outputs package/)
pnpm --filter @devdeck/plugin-market-my-tool build
```

The build output directory is the first segment of `manifest.entry`
(usually `package/`).

## 3. Pack

```bash
pnpm --filter @devdeck/marketplace pack market-my-tool
```

`pack-local.mjs` validates the manifest and entry, stages `manifest.json` +
`package/`, and writes:

- `marketplace/.local-dist/market-my-tool-<version>.zip`
- `marketplace/registry.local.json` (unpublished local index)

## 4. Sign

Generate a signing key once per marketplace:

```bash
pnpm --filter @devdeck/marketplace keygen --out .signing/marketplace-key.txt
```

Sign each package and the registry:

```bash
export DEVDECK_SIGNING_KEY="$(cat .signing/marketplace-key.txt)"

pnpm --filter @devdeck/marketplace sign \
  marketplace/.local-dist/market-my-tool-1.0.0.zip

pnpm --filter @devdeck/marketplace registry --all \
  --base-url https://example.com/marketplace \
  --out release-dist/registry.json

pnpm --filter @devdeck/marketplace sign release-dist/registry.json

# Verify locally (authoritative verification still happens in Rust)
PNPM_PUB=$(node marketplace/scripts/sign.mjs public-key)
pnpm --filter @devdeck/marketplace verify \
  release-dist/registry.json release-dist/registry.json.sig --pubkey "$PNPM_PUB"
```

Signature format matches `crates/devdeck-market/src/signing.rs`:

- Ed25519, 32-byte public key, standard Base64;
- key id = first 16 hex characters of `sha256(public_key)`;
- package signatures are embedded per registry entry, with a detached
  `<file>.sig` alongside each ZIP and `registry.json.sig` for the registry.

## 5. Publish

Upload the whole `release-dist/` directory to any HTTPS static host (GitHub
Releases, S3, nginx):

```text
registry.json
registry.json.sig
market-my-tool-1.0.0.zip
market-my-tool-1.0.0.zip.sig
```

`downloadUrl` in the registry must point at the ZIP; `--base-url` controls this.

The repository workflow `.github/workflows/marketplace-release.yml` automates
build → pack → sign → verify → GitHub Release upload. It requires the
`MARKETPLACE_SIGNING_KEY` secret and uses `make_latest: false` so app updates are
unaffected.

## 6. Local development

Use a throwaway key and serve the artifacts over loopback:

```bash
./scripts/marketplace-acceptance.sh market-emoji-search
# or manually: pack, sign, registry --base-url http://127.0.0.1:8765,
# python3 -m http.server 8765 --directory marketplace/.local-dist
```

Then add `http://127.0.0.1:8765/registry.json` in **Marketplace**. For a local
build you can also add the generated file directly, for example
`file:///Users/me/devDeck/marketplace/registry.local.json`; local file packages
must be `.zip`. For signature enforcement, open
**Settings → Registries → Trust options** and paste the public key.

## 7. Registry schema

```json
{
  "schemaVersion": 2,
  "name": "My Marketplace",
  "plugins": [
    {
      "manifest": { "schemaVersion": 2, "id": "market-my-tool", "...": "..." },
      "downloadUrl": "https://example.com/marketplace/market-my-tool-1.0.0.zip",
      "sha256": "64 lowercase hex chars",
      "size": 12345,
      "publishedAt": "2026-11-07T00:00:00Z",
      "status": "active",
      "signature": { "keyId": "8a1f0c2d4e6b8a90", "signature": "base64" }
    }
  ]
}
```

Source-level trust is configured in Settings:

- no key → digest-only (SHA-256 still verified);
- public key → signature checked when present;
- public key + **require signature** → missing/invalid signatures are rejected.

Keys and registries are documented in
[Marketplace protocol](../architecture/marketplace.md).
