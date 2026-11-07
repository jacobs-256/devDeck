# Security Policy

## Reporting a vulnerability

Do not open a public issue. Report privately to the maintainers with:

- a description of the issue and impact;
- reproduction steps or a proof of concept;
- affected version/commit;
- an optional suggested fix.

We will acknowledge receipt and work on a fix.

## Scope

DevToolBox treats the renderer and Marketplace plugins as untrusted. Relevant
boundaries are documented in
[docs/architecture/security-model.md](docs/architecture/security-model.md):
capability broker, plugin iframe CSP, path sandbox, SSH host-key pinning,
registry/package signatures, and updater signature verification.
