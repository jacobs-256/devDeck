#!/usr/bin/env bash
# End-to-end Marketplace acceptance run for a real plugin.
#
#   ./scripts/marketplace-acceptance.sh [plugin-id]
#
# Builds a plugin, packs and signs it with a throwaway key using the same
# `pack-release.mjs` path as the release workflow, signs the registry, serves
# the artifacts over loopback HTTP, and installs them through the host's
# signed-registry code path (`cargo test ... manual_signed_registry_acceptance`).
#
# Requirements: node, pnpm, python3, cargo, zip. The throwaway key never leaves
# the temporary directory.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN="${1:-market-emoji-search}"
PORT="${MARKETPLACE_ACCEPTANCE_PORT:-8765}"
WORK="$(mktemp -d)"
SERVER_PID=""

cleanup() {
  if [[ -n "${SERVER_PID}" ]]; then
    kill "${SERVER_PID}" 2>/dev/null || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -rf "${WORK}"
  rm -rf "${ROOT}/marketplace/release-dist"
}
trap cleanup EXIT

# Stale artifacts from a previous run would be published instead of ours.
rm -rf "${ROOT}/marketplace/release-dist"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: missing $1" >&2
    exit 1
  fi
}
need node
need pnpm
need python3
need cargo
need curl
need zip

echo "==> Building plugin SDK"
pnpm --dir "${ROOT}" --filter @devdeck/plugin-sdk build >/dev/null

echo "==> Building ${PLUGIN}"
pnpm --dir "${ROOT}" --filter "@devdeck/plugin-${PLUGIN}" build >/dev/null

echo "==> Generating throwaway signing key"
PUBLIC_KEY="$(node "${ROOT}/marketplace/scripts/sign.mjs" keygen --out "${WORK}/key.txt" \
  | sed -n 's/^public key (Base64): //p')"
if [[ -z "${PUBLIC_KEY}" ]]; then
  echo "error: could not read the generated public key" >&2
  exit 1
fi
SIGNING_KEY="$(cat "${WORK}/key.txt")"

echo "==> Packing and signing through the release pipeline"
DEVDECK_SIGNING_KEY="${SIGNING_KEY}" \
MARKETPLACE_DOWNLOAD_BASE_URL="http://127.0.0.1:${PORT}" \
MARKETPLACE_TAG=acceptance \
  node "${ROOT}/marketplace/scripts/pack-release.mjs" "${PLUGIN}" >/dev/null
DEVDECK_SIGNING_KEY="${SIGNING_KEY}" \
  node "${ROOT}/marketplace/scripts/sign.mjs" sign "${ROOT}/marketplace/release-dist/registry.json" >/dev/null

echo "==> Verifying signatures"
node "${ROOT}/marketplace/scripts/sign.mjs" verify \
  "${ROOT}/marketplace/release-dist/registry.json" \
  "${ROOT}/marketplace/release-dist/registry.json.sig" \
  --pubkey "${PUBLIC_KEY}" >/dev/null
for zip in "${ROOT}"/marketplace/release-dist/*.zip; do
  node "${ROOT}/marketplace/scripts/sign.mjs" verify "${zip}" "${zip}.sig" --pubkey "${PUBLIC_KEY}" >/dev/null
done

echo "==> Serving ${ROOT}/marketplace/release-dist on 127.0.0.1:${PORT}"
python3 -m http.server "${PORT}" --directory "${ROOT}/marketplace/release-dist" >"${WORK}/server.log" 2>&1 &
SERVER_PID=$!
READY=0
for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:${PORT}/registry.json" -o "${WORK}/served.json" 2>/dev/null; then
    READY=1
    break
  fi
  sleep 0.1
done
if [[ "${READY}" -ne 1 ]]; then
  echo "error: port ${PORT} did not serve our artifacts (is another server running?)" >&2
  exit 1
fi
if ! cmp -s "${ROOT}/marketplace/release-dist/registry.json" "${WORK}/served.json"; then
  echo "error: served registry.json differs from the signed file (stale server on port ${PORT}?)" >&2
  exit 1
fi

echo "==> Installing through the host"
DEVDECK_ACCEPT_REGISTRY="http://127.0.0.1:${PORT}/registry.json" \
DEVDECK_ACCEPT_PUBKEY="${PUBLIC_KEY}" \
DEVDECK_ACCEPT_PLUGIN="${PLUGIN}" \
  cargo test --manifest-path "${ROOT}/Cargo.toml" -p devdeck-desktop \
  manual_signed_registry_acceptance -- --ignored --nocapture

echo "==> Acceptance run passed for ${PLUGIN}"
