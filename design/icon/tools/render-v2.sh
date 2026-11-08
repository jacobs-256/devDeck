#!/usr/bin/env bash
# Render the round-2 SVGs to transparent 1024x1024 PNGs with headless Chrome.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE="${TMPDIR:-/tmp}/dsh-icon-chrome"
mkdir -p "$ROOT/render-v2" "$PROFILE"
for f in "$ROOT"/src-v2/*.svg; do
  name="$(basename "$f" .svg)"
  "$CHROME" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --user-data-dir="$PROFILE" --force-device-scale-factor=1 \
    --window-size=1024,1024 --default-background-color=00000000 \
    --screenshot="$ROOT/render-v2/$name.png" "file://$f" >/dev/null 2>&1
  echo "rendered $name.png"
done
