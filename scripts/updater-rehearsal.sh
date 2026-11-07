#!/usr/bin/env bash
# Local rehearsal of the Tauri updater release path.
#
#   ./scripts/updater-rehearsal.sh
#
# Builds the macOS/Linux updater artifact with the real signing key, verifies
# the minisign signature against the public key pinned in tauri.conf.json, and
# writes a `latest.json` draft with the URL shape used by GitHub Releases.
# It does not publish anything.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT}/apps/desktop/src-tauri/tauri.conf.json').version")"
PUBKEY="$(node -p "require('${ROOT}/apps/desktop/src-tauri/tauri.conf.json').plugins.updater.pubkey")"
REPO="${GITHUB_REPOSITORY:-XthingsJacobs/devToolBox}"
KEY_FILE="${TAURI_SIGNING_PRIVATE_KEY_FILE:-${ROOT}/.signing/devtoolbox.key}"

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  if [[ ! -f "${KEY_FILE}" ]]; then
    echo "error: no signing key. Set TAURI_SIGNING_PRIVATE_KEY or place ${KEY_FILE}." >&2
    exit 1
  fi
  export TAURI_SIGNING_PRIVATE_KEY
  TAURI_SIGNING_PRIVATE_KEY="$(cat "${KEY_FILE}")"
fi

if [[ -z "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]]; then
  echo "info: no key password set; using an empty password"
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
fi

echo "==> Building updater artifacts for v${VERSION}"
pnpm --dir "${ROOT}/apps/desktop" exec tauri build \
  --bundles app \
  --config '{"bundle":{"createUpdaterArtifacts":true}}' >/dev/null

ARTIFACT="$(ls -t "${ROOT}"/target/release/bundle/macos/*.app.tar.gz 2>/dev/null | head -1 || true)"
SIGNATURE="${ARTIFACT}.sig"
if [[ -z "${ARTIFACT}" || ! -f "${SIGNATURE}" ]]; then
  echo "error: updater artifacts were not produced under target/release/bundle/macos" >&2
  exit 1
fi

echo "==> Verifying the signature against the pinned public key"
node "${ROOT}/scripts/verify-updater-artifact.mjs" \
  --artifact "${ARTIFACT}" \
  --signature "${SIGNATURE}" \
  --pubkey "${PUBKEY}"

ARCH="$(uname -m)"
case "${ARCH}" in
  arm64|aarch64) ARCH="aarch64" ;;
  x86_64|amd64) ARCH="x86_64" ;;
esac
if [[ "$(uname -s)" == "Darwin" ]]; then
  PLATFORM="darwin-${ARCH}"
else
  PLATFORM="linux-${ARCH}"
fi
ASSET="$(basename "${ARTIFACT}")"
URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ASSET}"

echo "==> Writing latest.json draft"
LATEST_JSON="${ROOT}/target/release/bundle/latest.json"
node - "${LATEST_JSON}" "${VERSION}" "${PLATFORM}" "${URL}" "${SIGNATURE}" <<'NODE'
const fs = require('fs');
const [out, version, platform, url, signaturePath] = process.argv.slice(2);
const signature = fs.readFileSync(signaturePath, 'utf8').trim();
const document = {
  version,
  notes: `DevToolBox ${version}`,
  pub_date: new Date().toISOString(),
  platforms: {
    [platform]: { signature, url },
  },
};
fs.writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
console.log(`wrote ${out}`);
NODE

echo "==> latest.json"
cat "${LATEST_JSON}"
echo
echo "==> Rehearsal passed: artifact, signature, pinned key, and latest.json are consistent."
echo "    Artifact: ${ARTIFACT}"
