# CLI Guide (`cli.sh`)

`cli.sh` is a thin wrapper around the repository's pnpm/Cargo commands.

```bash
chmod +x ./cli.sh
./cli.sh help
```

## Commands

| Command                                    | Action                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `./cli.sh doctor`                          | Print Node, pnpm, Git, and Rust versions                                             |
| `./cli.sh dev`                             | `pnpm dev` (Tauri dev loop)                                                          |
| `./cli.sh build`                           | Renderer + Plugin SDK build                                                          |
| `./cli.sh check`                           | `pnpm lint`, `pnpm typecheck`, `pnpm test`, plus Rust checks when Cargo is available |
| `./cli.sh clear`                           | Interactive local data/artifact cleanup                                              |
| `./cli.sh plugin create`                   | Scaffold a marketplace plugin                                                        |
| `./cli.sh plugin [<id>\|all]`              | Build + pack plugin(s) into `marketplace/registry.local.json`                        |
| `./cli.sh package [macos\|windows] [arch]` | Tauri installer for the current OS                                                   |

## Development

```bash
./cli.sh dev
./cli.sh build
./cli.sh check
```

`check` runs the same gates as CI where possible; Rust checks are skipped if
`cargo` is not installed.

## Packaging

```bash
./cli.sh package macos                 # .app + .dmg
./cli.sh package macos arm64           # aarch64 target
./cli.sh package macos x64
./cli.sh package macos universal
./cli.sh package windows               # NSIS, run on Windows
```

Artifacts land in `target/release/bundle/` (`macos/`, `dmg/`, or `nsis/`).
Tauri builds are per-OS; `all` is not supported by the CLI. Use the GitHub
release workflow to build macOS and Windows in parallel.

## Marketplace

```bash
./cli.sh plugin create            # interactive scaffold
./cli.sh plugin                   # choose a plugin, then build + pack
./cli.sh plugin market-emoji-search
./cli.sh plugin all
```

Packaging writes `marketplace/registry.local.json` and ZIPs under
`marketplace/.local-dist/`. Signing and registry publishing use the
`marketplace` package scripts; see
[Packaging and signing](../plugin-dev/packaging.md).

## Related

- [Development guide](../development.md)
- [Troubleshooting](troubleshooting.md)
