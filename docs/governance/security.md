# Security Policy

## Supported Versions

Only the latest version on the default branch is supported with security updates.

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Instead, report privately to the maintainers with:

- A clear description of the issue and impact
- Reproduction steps (or a proof of concept)
- Affected versions / commit hash
- Any suggested fix (optional)

We will acknowledge receipt and work on a fix as soon as possible.

## Security Boundaries

- The renderer never executes arbitrary commands; every privileged operation is a
  typed Tauri command in `apps/desktop/src-tauri/src/commands.rs`.
- Plugins run in a sandboxed iframe with `connect-src 'none'` and reach the host
  only through `plugin_sdk_call`, which re-checks permissions on every call.
- File access is token-based and user-initiated; paths are sandboxed.
- Registry and package signatures are verified before install; updater artifacts
  are verified against the embedded public key.
- The full model is documented in
  [architecture/security-model.md](../architecture/security-model.md).
