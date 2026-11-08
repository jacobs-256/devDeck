# Marketplace Protocol

The Marketplace is an **open, decentralized plugin distribution protocol**, not
a single store. Anybody can host a `registry.json`, and any package that passes
validation can be installed. DevDeck ships with the official registry
preconfigured, and users can add or remove registries.

This document is the normative specification for:

- the plugin package layout,
- the manifest schema,
- the registry document,
- package integrity and signing, and
- the install/upgrade lifecycle.

## 1. Design principles

1. **Static hosting.** A registry is a JSON file plus ZIP files served over
   HTTPS. No server API, no accounts, no lock-in. GitHub Releases is a valid
   registry host.
2. **Verifiable artifacts.** Every release carries a SHA-256 digest; signatures
   are optional but strongly recommended and are verified before extraction.
3. **Least privilege.** A plugin declares capabilities in its manifest. The host
   refuses undeclared capabilities at runtime, even if the plugin's JavaScript
   tries to call them.
4. **No silent privilege growth.** The install record keeps the previous
   manifest; upgrades re-issue grants from the new manifest only after the
   package is verified, and permission changes are visible in the manifest and
   registry diff.
5. **Boring formats.** JSON manifests, ZIP packages, Ed25519 signatures, SemVer.
   Everything is readable and reproducible with common tools.

## 2. Package layout

```
my-plugin-1.2.3.zip
├── manifest.json          required, at the archive root
├── package/               the plugin's built web app
│   ├── index.html         entry point declared by manifest.entry
│   └── assets/…
└── icon.png               optional, referenced by manifest.icon
```

Rules enforced by `devdeck-market` during extraction:

| Rule                                                   | Failure code             |
| ------------------------------------------------------ | ------------------------ |
| `manifest.json` must exist at the archive root         | `invalid_manifest`       |
| Every path is relative, uses `/`, and contains no `..` | `invalid_argument`       |
| No symbolic links, devices, or FIFOs                   | `invalid_argument`       |
| At most 20 000 entries                                 | `invalid_argument`       |
| At most 512 MiB uncompressed in total                  | `invalid_argument`       |
| At most 64 MiB per file                                | `invalid_argument`       |
| Declared uncompressed size must match bytes written    | `integrity_check_failed` |
| `entry` and `icon` must resolve inside the package     | `invalid_manifest`       |

## 3. Manifest schema (v2)

`manifest.json`, UTF-8, camelCase keys.

```json
{
  "schemaVersion": 2,
  "id": "market-ip-lookup",
  "name": "IP Lookup",
  "description": "Look up IP geolocation and network details",
  "version": "1.0.0",
  "sdkVersion": "2.0",
  "entry": "package/index.html",
  "categoryId": "network-tools",
  "author": { "name": "DevDeck", "url": "https://example.com" },
  "license": "Apache-2.0",
  "homepage": "https://github.com/example/devdeck-ip-lookup",
  "repository": "https://github.com/example/devdeck-ip-lookup",
  "icon": "icon.png",
  "keywords": ["ip", "network", "geo"],
  "permissions": ["storage:kv", "http:proxy"],
  "httpDomains": ["api.ip2location.io", "ipinfo.io"],
  "envAllowlist": [],
  "minAppVersion": "3.0.0"
}
```

| Field           | Required    | Rules                                                          |
| --------------- | ----------- | -------------------------------------------------------------- |
| `schemaVersion` | recommended | `1` or `2`; omitted means `1`                                  |
| `id`            | yes         | lowercase slug, 1–64 chars, no `--`, immutable once published  |
| `name`          | yes         | 1–64 characters                                                |
| `description`   | recommended | ≤ 512 characters                                               |
| `version`       | yes         | SemVer                                                         |
| `sdkVersion`    | yes         | `2.x` for new plugins; `1.x` accepted with a warning           |
| `entry`         | yes         | relative `.html` path inside the package                       |
| `categoryId`    | yes         | lowercase slug                                                 |
| `author`        | recommended | string or `{ name, url?, email? }`                             |
| `license`       | yes         | SPDX identifier                                                |
| `permissions`   | no          | no duplicates; unknown ids are rejected                        |
| `httpDomains`   | conditional | required when `http:proxy`/`http:external` is used in schema 2 |
| `envAllowlist`  | conditional | required when `system:env:read` is used                        |
| `minAppVersion` | no          | SemVer                                                         |

### Legacy compatibility

Schema 1 manifests (Electron era) remain installable:

- `sdkVersion: "1.0"` produces a `legacy_sdk` **warning**, not an error.
- `http:proxy` without `httpDomains` is accepted, but such a plugin can only
  reach `https:` hosts — no plaintext HTTP.
- All other schema-2 rules apply as warnings where they were previously absent.

## 4. Permissions

The permission string is the wire format and is a public API. Renaming one is a
breaking change.

| Permission             | Grants                                                         | Allowlist required |
| ---------------------- | -------------------------------------------------------------- | ------------------ |
| `storage:kv`           | Host-owned key/value store, namespaced per plugin, 8 MiB quota | —                  |
| `http:proxy`           | HTTP(S) through the host (no CORS restrictions)                | `httpDomains`      |
| `http:external`        | HTTP(S) issued by the plugin webview (subject to CORS)         | `httpDomains`      |
| `fs:dialog`            | User-mediated open/save dialogs                                | —                  |
| `fs:plugin-data`       | Read/write inside the plugin's own data directory              | —                  |
| `net:socket`           | TCP/UDP client and server sockets                              | —                  |
| `net:ssh`              | SSH and SFTP sessions                                          | —                  |
| `system:openExternal`  | Open an `http(s)` URL in the browser                           | —                  |
| `system:revealPath`    | Reveal a path in the file manager                              | —                  |
| `system:openPath`      | Open a path with its default handler                           | —                  |
| `system:notifications` | Desktop notifications                                          | —                  |
| `system:env:read`      | Read environment variables                                     | `envAllowlist`     |
| `system:getInfo`       | Read app and OS metadata                                       | —                  |
| `clipboard:write`      | Write to the clipboard                                         | —                  |
| `log:write`            | Append to the rotating plugin log                              | —                  |
| `theme:read`           | Read the host theme                                            | —                  |

Permissions marked in `Permission::is_sensitive()` (`net:socket`, `net:ssh`,
`system:openPath`, `system:revealPath`, `system:env:read`, `fs:plugin-data`,
`fs:read`, `fs:write`) are highlighted in the permission table and SDK docs so
users and reviewers can identify privileged capabilities.

## 5. Registry document

```json
{
  "schemaVersion": 2,
  "name": "DevDeck Official",
  "updatedAt": "2026-11-07T00:00:00Z",
  "plugins": [
    {
      "manifest": { "...": "as above" },
      "downloadUrl": "https://github.com/XthingsJacobs/devDeck/releases/download/marketplace/market-ip-lookup-1.0.0.zip",
      "sha256": "9f2c…64 hex chars",
      "size": 182344,
      "publishedAt": "2026-11-07T00:00:00Z",
      "status": "active",
      "signature": { "keyId": "8a1f0c2d4e6b8a90", "signature": "base64…" }
    }
  ]
}
```

Validation rules:

- `schemaVersion` is `1` or `2`.
- Every entry's manifest passes schema validation.
- `sha256` is 64 lowercase hex characters.
- `downloadUrl` is `https://` (or `http://localhost` for development).
- `(id, version)` pairs are unique within a registry.
- `status` is one of `active`, `deprecated`, `yanked`; unknown values are
  treated as unavailable.

Resolution: `RegistryIndex::latest(id)` returns the highest SemVer release with
status `active`, ignoring yanked releases.

### Registry sources in the app

In development builds users add a registry by URL in the **Marketplace** registry
bar. Advanced trust settings live in **Settings → Registries → Trust options**.
Release builds show only the official registry. Each source is stored
in `marketplace-sources.json` under the app data directory:

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "id": "example-com",
      "name": "Example Marketplace",
      "url": "https://example.com/marketplace/registry.json",
      "publicKey": "base64-ed25519-public-key",
      "requireSignature": true,
      "addedAtMs": 1762500000000
    }
  ]
}
```

The Trust options form lets you paste the registry's Ed25519 public key and
require signatures. Sources without a key remain digest-only; each registry can
be refreshed from the module center, and the catalog supports text search and a
category filter.

Trust policy per source:

| Setting                                | Effect                                                      |
| -------------------------------------- | ----------------------------------------------------------- |
| (none)                                 | Digest-only: `sha256` is always required and verified       |
| `publicKey`                            | Fetches `<registry>.sig` and verifies it when present       |
| `publicKey` + `requireSignature: true` | Rejects the registry if the signature is missing or invalid |

URLs must be `https://`; `http://localhost` and `http://127.0.0.1` are allowed
for local development. A `file:///…/registry.local.json` URL is also accepted
when it points at a local `.json` registry; file packages must be `.zip`. A
remote registry cannot reference `file://` downloads. Downloads are capped (8 MiB registry, 128 MiB package),
every redirect is re-checked against the https rule, and the fetched index is
cached in memory for the session.

### Hosting your own registry

```bash
# 1. Build plugin packages
pnpm --filter @devdeck/marketplace pack

# 2. Generate registry.json (validated by the same Rust rules)
pnpm --filter @devdeck/marketplace registry

# 3. Upload registry.json + *.zip anywhere HTTPS-served
```

Any static host works: GitHub Releases, S3, Netlify, a plain nginx directory.

## 6. Integrity and signing

### Digests

Every release entry must carry `sha256` of the exact `.zip` bytes. The installer
computes the digest before touching the archive and aborts on mismatch with
`integrity_check_failed`.

### Detached Ed25519 signatures

Two documents can be signed independently:

- **packages**: registry entry `signature` covers the `.zip` bytes;
- **registries**: a sibling `registry.json.sig` covers the exact registry bytes.

Signature format:

- algorithm: Ed25519 (`ed25519-dalek`, `verify_strict`)
- public key: 32 raw bytes, standard Base64
- signature: 64 raw bytes, standard Base64
- `keyId`: first 16 hex characters of `sha256(public_key_bytes)`

Verification lives in `crates/devdeck-market/src/signing.rs` and is exercised
by unit tests, including a tampering test.

### Trust policy

| Source configuration                  | Requirement                                              |
| ------------------------------------- | -------------------------------------------------------- |
| No public key                         | SHA-256 digest required and verified                     |
| Public key                            | Detached registry signature verified when present        |
| Public key + `requireSignature: true` | Registry/package signatures must verify or install fails |

## 7. Install lifecycle

```
              ┌──────────┐  install   ┌───────────┐
   (absent) ──►  staging  ───────────► installed │
              └──────────┘             └─────┬─────┘
                                            │ disable
                                       ┌────▼─────┐
                                       │ disabled │
                                       └────┬─────┘
                                            │ uninstall
                                        (removed)
```

Invariants:

1. **Atomic.** Install extracts into `.staging/<id>-<ts>`, validates, then
   renames into `plugins/<id>`. A crash leaves either the old or the new
   version, never a mixture.
2. **No downgrade by default.** An older SemVer over a newer one is refused
   unless the caller explicitly opts in (`allow_downgrade`).
3. **Reinstall preserves enablement.** Upgrading a disabled plugin keeps it
   disabled.
4. **State is authoritative.** `marketplace-state.json` records the manifest
   that was installed; directories without a record are ignored, and records
   whose directory vanished are reconciled away at startup.

## 8. Publishing a release

```bash
# 1. Build the plugin web app
pnpm --filter ./marketplace/modules/market-ip-lookup build

# 2. Package into .local-dist/<id>-<version>.zip (and hash it)
pnpm --filter @devdeck/marketplace pack market-ip-lookup

# 3. Create a signing key once, then sign the package
pnpm --filter @devdeck/marketplace keygen --out .signing/marketplace-key.txt
DEVDECK_SIGNING_KEY=$(cat .signing/marketplace-key.txt) \
  pnpm --filter @devdeck/marketplace sign .local-dist/market-ip-lookup-1.0.0.zip

# 4. Generate registry.json (embeds digests and signatures)
pnpm --filter @devdeck/marketplace registry --all \
  --base-url https://example.com/marketplace --out release-dist/registry.json

# 5. Sign the registry document and verify the chain
DEVDECK_SIGNING_KEY=$(cat .signing/marketplace-key.txt) \
  pnpm --filter @devdeck/marketplace sign release-dist/registry.json
pnpm --filter @devdeck/marketplace verify \
  release-dist/registry.json release-dist/registry.json.sig --pubkey <base64-public-key>
```

`registry.mjs` performs the same structural checks as the Rust validator so a
release fails locally instead of at install time; `devdeck-market` remains
the authoritative verifier in the app.

> Signing keys are secrets. `.signing/` is git-ignored; CI should read the seed
> from a repository secret named `DEVDECK_SIGNING_KEY`.

## 8.1 Local acceptance run

The repository ships an end-to-end rehearsal of the whole pipeline:

```bash
./scripts/marketplace-acceptance.sh market-emoji-search
# or: pnpm marketplace:acceptance
```

It builds the plugin, runs the same `pack-release.mjs` + `sign.mjs` pipeline as
the release workflow with a **throwaway** key, verifies every signature, serves
the artifacts on loopback HTTP, and installs the plugin through the host's
signed-registry path (`cargo test -p devdeck-desktop
manual_signed_registry_acceptance -- --ignored`). The script verifies that the served registry bytes match the signed
file and cleans up the key and artifacts afterwards.

Use it before publishing a release and after changing installer, registry, or
signing code.

## 9. Threat model

| Threat                             | Mitigation                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Zip slip (`../../etc/passwd`)      | `resolve_within` rejects traversal; extraction writes only under staging                             |
| Symlink escape                     | Archive entries with symlink type bits are rejected; installed paths re-checked with `ensure_within` |
| Zip bomb                           | Entry count, per-file, and total-size limits enforced while streaming                                |
| Malicious registry                 | HTTPS + digest + optional signature; manifests re-validated locally, never trusted from the registry |
| Malicious plugin JS                | Sandboxed iframe (opaque origin), CSP, no Node/Electron APIs, all privileges through the broker      |
| Permission escalation              | `sdk::dispatch` checks the grant on every call; grants are rebuilt from the installed manifest       |
| Redirect escape                    | Every HTTP redirect hop is re-authorized against `httpDomains`                                       |
| DNS rebinding / credentials in URL | URLs with embedded credentials rejected; only `http`/`https` schemes allowed                         |
| Log flooding                       | Rotating NDJSON log capped at 5 MiB, message truncated at 8 KiB                                      |

See [Security model](security-model.md) for the enforcement details.

## 10. Versioning policy

- Permission strings: append-only. Removing or renaming requires a manifest
  schema major bump.
- Manifest schema: additive within a major version; unknown fields are ignored.
- SDK: `2.x` follows SemVer. Plugins declare `sdkVersion`, and a plugin targeting
  a newer major than the host is rejected with `sdk_too_new`.
- Registry: `schemaVersion` gates the document shape.

> 中文镜像：[docs/zh-CN/architecture/marketplace.md](../zh-CN/architecture/marketplace.md)
