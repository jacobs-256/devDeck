#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

print_info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
print_ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

repo_root() {
  local src="${BASH_SOURCE[0]}"
  while [ -h "$src" ]; do
    local dir
    dir="$(cd -P "$(dirname "$src")" && pwd)"
    src="$(readlink "$src")"
    [[ "$src" != /* ]] && src="$dir/$src"
  done
  cd -P "$(dirname "$src")" && pwd
}

ROOT_DIR="$(repo_root)"
cd "$ROOT_DIR"

prompt() {
  local label="$1"
  local def="${2:-}"
  local v=""
  if [[ -n "$def" ]]; then
    read -r -p "$label [$def]: " v
    v="${v:-$def}"
  else
    read -r -p "$label: " v
  fi
  echo "$v"
}

confirm() {
  local label="$1"
  local def="${2:-n}"
  local v=""
  local hint="y/N"
  if [[ "$def" == "y" || "$def" == "Y" ]]; then
    hint="Y/n"
  fi
  read -r -p "$label ($hint): " v
  v="${v:-$def}"
  v="$(echo "$v" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
  [[ "$v" == "y" || "$v" == "yes" ]]
}

detect_user_data_dir() {
  local mac_dev_dir="$HOME/Library/Application Support/DevToolBox-dev"
  local mac_dir="$HOME/Library/Application Support/DevToolBox"
  local linux_dev_dir="$HOME/.config/DevToolBox-dev"
  local linux_dir="$HOME/.config/DevToolBox"
  if [[ -d "$mac_dev_dir" ]]; then
    echo "$mac_dev_dir"
    return 0
  fi
  if [[ -d "$mac_dir" ]]; then
    echo "$mac_dir"
    return 0
  fi
  if [[ -d "$linux_dev_dir" ]]; then
    echo "$linux_dev_dir"
    return 0
  fi
  if [[ -d "$linux_dir" ]]; then
    echo "$linux_dir"
    return 0
  fi
  echo "$mac_dev_dir"
}

usage() {
  cat <<'EOF'
Usage:
  ./cli.sh <command> [args...]

Commands:
  dev                           Run desktop dev server
  build                         Build renderer + main/preload
  clear                         Clear local user data / marketplace artifacts (interactive)
  plugin create                  Create a marketplace plugin template (interactive)
  plugin                         Select, build, and pack marketplace plugin(s) into a local registry zip
  plugin <market-id|all>         Build + pack marketplace plugin(s) into a local registry zip
  package <macos|windows|all> [arch]   Package installers (.dmg/.exe)
  check                          Run local quality/security checks (JS + Rust)
  tool new                       Create a new built-in tool template (delegates to pnpm new:tool)
  doctor                         Print environment info
  help
EOF
}

ensure_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    print_error "Missing command: $1"
    exit 1
  fi
}

package_pnpm_spec() {
  if command -v node >/dev/null 2>&1; then
    node -e 'try { const pm = require("./package.json").packageManager || ""; const m = pm.match(/^pnpm@(.+)$/); process.stdout.write(m ? pm : "pnpm@10.10.0"); } catch { process.stdout.write("pnpm@10.10.0"); }'
  else
    echo "pnpm@10.10.0"
  fi
}

PNPM_CMD=()
ensure_pnpm() {
  if [[ "${#PNPM_CMD[@]}" -gt 0 ]]; then
    return 0
  fi

  if command -v pnpm >/dev/null 2>&1; then
    PNPM_CMD=(pnpm)
    return 0
  fi

  local spec
  spec="$(package_pnpm_spec)"

  if command -v corepack >/dev/null 2>&1; then
    print_info "pnpm not found; trying Corepack ($spec)..."
    corepack enable >/dev/null 2>&1 || true
    corepack prepare "$spec" --activate >/dev/null 2>&1 || true
    if corepack pnpm -v >/dev/null 2>&1; then
      PNPM_CMD=(corepack pnpm)
      return 0
    fi
    if command -v pnpm >/dev/null 2>&1; then
      PNPM_CMD=(pnpm)
      return 0
    fi
  fi

  if command -v npm >/dev/null 2>&1; then
    print_info "pnpm not found; using $spec via npm exec."
    PNPM_CMD=(npm exec --yes --package "$spec" -- pnpm)
    return 0
  fi

  print_error "Missing command: pnpm"
  print_error "Install one of:"
  print_error "  npm install -g $spec"
  print_error "  brew install pnpm"
  exit 1
}

run_pnpm() {
  ensure_pnpm
  "${PNPM_CMD[@]}" "$@"
}

cmd_doctor() {
  ensure_cmd node
  ensure_pnpm
  print_ok "Node $(node -v) | pnpm $("${PNPM_CMD[@]}" -v)"
  if command -v git >/dev/null 2>&1; then
    print_ok "Git $(git --version | awk '{print $3}')"
  fi
  if command -v rustc >/dev/null 2>&1; then
    print_ok "Rust $(rustc --version | awk '{print $2}') | cargo $(cargo --version | awk '{print $2}')"
  else
    print_info "Rust toolchain not found (needed for apps/desktop and crates/)"
  fi
}

cmd_dev() {
  ensure_pnpm
  unset NODE_OPTIONS
  export DEVTOOLBOX_DEBUG="${DEVTOOLBOX_DEBUG:-1}"
  run_pnpm dev
}

cmd_build() {
  ensure_pnpm
  run_pnpm build
}

cmd_clear() {
  local candidates=()
  local p0="$HOME/Library/Application Support/DevToolBox-dev"
  local p1="$HOME/Library/Application Support/DevToolBox"
  local p2="$HOME/Library/Application Support/cross-platform-toolbox"
  local p3="$HOME/.config/DevToolBox"
  local p4="$HOME/.config/DevToolBox-dev"
  [[ -d "$p0" ]] && candidates+=("$p0")
  [[ -d "$p1" ]] && candidates+=("$p1")
  [[ -d "$p2" ]] && candidates+=("$p2")
  [[ -d "$p3" ]] && candidates+=("$p3")
  [[ -d "$p4" ]] && candidates+=("$p4")

  local user_data=""
  if [[ "${#candidates[@]}" -eq 0 ]]; then
    user_data="$(detect_user_data_dir)"
  elif [[ "${#candidates[@]}" -eq 1 ]]; then
    user_data="${candidates[0]}"
  else
    print_info "Found multiple user data directories:"
    local idx=1
    for d in "${candidates[@]}"; do
      echo "  [$idx] $d"
      idx=$((idx + 1))
    done
    local picked
    picked="$(prompt 'Select a directory index to clear' '1')"
    if [[ ! "$picked" =~ ^[0-9]+$ ]] || [[ "$picked" -lt 1 ]] || [[ "$picked" -gt "${#candidates[@]}" ]]; then
      print_error "Invalid selection: $picked"
      exit 1
    fi
    user_data="${candidates[$((picked - 1))]}"
  fi

  print_info "User data dir: $user_data"
  if [[ ! -d "$user_data" ]]; then
    print_error "User data dir not found: $user_data"
    print_info "Launch the app once (./cli.sh dev) to create it, then retry."
    exit 1
  fi

  print_info "This command deletes local files. Close DevToolBox before continuing."
  if ! confirm "Continue" "n"; then
    print_info "Cancelled"
    return 0
  fi

  if confirm "1) Clear saved app info (Local Storage / Session / Cookies / Preferences / Cache)" "n"; then
    rm -rf "$user_data/Local Storage" "$user_data/Session Storage" "$user_data/Cache" "$user_data/Code Cache" "$user_data/GPUCache" "$user_data/blob_storage" "$user_data/DawnGraphiteCache" "$user_data/DawnWebGPUCache" 2>/dev/null || true
    rm -f "$user_data/Preferences" "$user_data/Cookies" "$user_data/Cookies-journal" "$user_data/Network Persistent State" "$user_data/SharedStorage" "$user_data/SharedStorage-wal" 2>/dev/null || true
    print_ok "Saved app info cleared"
  fi

  if confirm "2) Clear marketplace-installed plugins (uninstall all)" "n"; then
    rm -rf "$user_data/modules" "$user_data/plugins" 2>/dev/null || true
    rm -f "$user_data/plugin-kv.json" 2>/dev/null || true
    mkdir -p "$user_data/modules" "$user_data/plugins"
    printf '{\n  \"installed\": {}\n}\n' >"$user_data/marketplace-state.json"
    print_ok "Marketplace plugins cleared"
  fi

  if confirm "3) Clear marketplace cache (registries/download cache)" "n"; then
    rm -rf "$user_data/marketplace-cache" 2>/dev/null || true
    mkdir -p "$user_data/marketplace-cache"
    print_ok "Marketplace cache cleared"
  fi

  if confirm "4) Clear plugin KV storage (plugin-kv.json)" "n"; then
    rm -f "$user_data/plugin-kv.json" 2>/dev/null || true
    print_ok "Plugin KV cleared"
  fi

  if confirm "5) Reset device-id (affects device-bound backup encryption)" "n"; then
    rm -f "$user_data/device-id.txt" 2>/dev/null || true
    print_ok "device-id reset (will be regenerated on next run)"
  fi

  if confirm "6) Init marketplace/registry.local.json and clear marketplace/.local-dist" "n"; then
    mkdir -p "$ROOT_DIR/marketplace/.local-dist"
    rm -rf "$ROOT_DIR/marketplace/.local-dist"/* 2>/dev/null || true
    printf '{\n  \"schemaVersion\": 1,\n  \"plugins\": []\n}\n' >"$ROOT_DIR/marketplace/registry.local.json"
    print_ok "Local registry initialized"
  fi

  if confirm "7) Clear build artifacts (dist / dist-electron / release)" "n"; then
    rm -rf "$ROOT_DIR/dist" "$ROOT_DIR/dist-electron" "$ROOT_DIR/release" 2>/dev/null || true
    print_ok "Build artifacts cleared"
  fi

  print_ok "Done"
}

marketplace_plugin_ids() {
  if [[ ! -d marketplace/modules ]]; then
    return 0
  fi
  find marketplace/modules -maxdepth 1 -type d -name 'market-*' -print | while IFS= read -r d; do
    [[ -f "$d/manifest.json" ]] || continue
    basename "$d"
  done | sort
}

marketplace_plugin_name() {
  local id="$1"
  local manifest_path="marketplace/modules/$id/manifest.json"
  node -e 'const fs = require("fs"); const p = process.argv[1]; try { const m = JSON.parse(fs.readFileSync(p, "utf8")); process.stdout.write(typeof m.name === "string" ? m.name : ""); } catch {}' "$manifest_path"
}

cmd_plugin() {
  ensure_pnpm
  ensure_cmd node
  local action="${1:-}"
  shift || true

  if [[ "$action" == "create" ]]; then
    local plugin_id=""
    plugin_id="$(prompt 'Plugin ID (e.g. market-hello-tool)' '')"
    plugin_id="$(echo "$plugin_id" | tr -d '[:space:]')"
    if [[ -z "$plugin_id" ]]; then
      print_error "Plugin ID is required"
      exit 1
    fi
    if [[ ! "$plugin_id" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
      print_error "Invalid plugin id: $plugin_id (expected kebab-case)"
      exit 1
    fi
    if [[ ! "$plugin_id" =~ ^market- ]]; then
      print_error "Invalid plugin id: $plugin_id (must start with market-)"
      exit 1
    fi

    local name
    name="$(prompt 'Plugin Name' "$plugin_id")"
    local description
    description="$(prompt 'Description' 'A marketplace plugin for DevToolBox')"
    local version
    version="$(prompt 'Version' '0.1.0')"
    local sdk_version
    sdk_version="$(prompt 'SDK Version' '1.0')"
    local category_id
    category_id="$(prompt 'categoryId (dev-tools/text-tools/network-tools/security-tools/other-tools)' 'dev-tools')"
    local author
    author="$(prompt 'Author' 'DevToolBox')"
    local license
    license="$(prompt 'License' 'Apache-2.0')"
    local homepage
    homepage="$(prompt 'Homepage' 'https://example.com')"
    local repository
    repository="$(prompt 'Repository' 'https://example.com')"
    local permissions_raw
    permissions_raw="$(prompt 'Permissions (comma separated)' 'storage:kv')"

    name="${name//$'\n'/ }"
    description="${description//$'\n'/ }"
    author="${author//$'\n'/ }"
    homepage="${homepage//$'\n'/ }"
    repository="${repository//$'\n'/ }"
    name="${name//\\/\\\\}"; name="${name//\"/\\\"}"
    description="${description//\\/\\\\}"; description="${description//\"/\\\"}"
    author="${author//\\/\\\\}"; author="${author//\"/\\\"}"
    homepage="${homepage//\\/\\\\}"; homepage="${homepage//\"/\\\"}"
    repository="${repository//\\/\\\\}"; repository="${repository//\"/\\\"}"

    local module_dir="marketplace/modules/$plugin_id"
    if [[ -e "$module_dir" ]]; then
      print_error "Target already exists: $module_dir"
      exit 1
    fi

    mkdir -p "$module_dir/src"

    local permissions_json="[]"
    if [[ -n "${permissions_raw// /}" ]]; then
      IFS=',' read -r -a perms <<<"$permissions_raw"
      local arr=""
      for p in "${perms[@]}"; do
        p="$(echo "$p" | tr -d '[:space:]')"
        [[ -z "$p" ]] && continue
        p="${p//\\/\\\\}"; p="${p//\"/\\\"}"
        if [[ -z "$arr" ]]; then
          arr="\"$p\""
        else
          arr="$arr, \"$p\""
        fi
      done
      permissions_json="[$arr]"
    fi

    cat >"$module_dir/manifest.json" <<EOF
{
  "id": "$plugin_id",
  "name": "$name",
  "description": "$description",
  "version": "$version",
  "sdkVersion": "$sdk_version",
  "entry": "package/index.html",
  "categoryId": "$category_id",
  "author": "$author",
  "license": "$license",
  "homepage": "$homepage",
  "repository": "$repository",
  "permissions": $permissions_json
}
EOF

    cat >"$module_dir/package.json" <<EOF
{
  "name": "@devtoolbox/plugin-$plugin_id",
  "private": true,
  "version": "$version",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json --noEmit && vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.6.3",
    "vite": "^6.0.5"
  }
}
EOF

    cat >"$module_dir/tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src"]
}
EOF

    cat >"$module_dir/vite.config.ts" <<'EOF'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'package',
    emptyOutDir: true,
  },
});
EOF

    cat >"$module_dir/index.html" <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DevToolBox Plugin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
EOF

    cat >"$module_dir/src/main.tsx" <<'EOF'
import { createRoot } from 'react-dom/client';
import App from './App';
import './style.css';

createRoot(document.getElementById('root')!).render(<App />);
EOF

    cat >"$module_dir/src/sdk.ts" <<'EOF'
export type SdkError = { code: string; message: string; details?: unknown };
export type SdkResult<T> = { ok: true; data?: T } | { ok: false; error: SdkError };

type ResponseMessage =
  | { type: 'devtoolbox:sdk:response'; requestId: string; ok: true; data?: unknown }
  | { type: 'devtoolbox:sdk:response'; requestId: string; ok: false; error: SdkError };

const pending = new Map<string, (res: SdkResult<unknown>) => void>();

window.addEventListener('message', (event: MessageEvent) => {
  const msg = event.data as ResponseMessage;
  if (!msg || msg.type !== 'devtoolbox:sdk:response') return;
  const cb = pending.get(msg.requestId);
  if (!cb) return;
  pending.delete(msg.requestId);
  if (msg.ok) cb({ ok: true, data: msg.data });
  else cb({ ok: false, error: msg.error });
});

export function callSdk<T = unknown>(method: string, params?: unknown, timeoutMs = 15000): Promise<SdkResult<T>> {
  const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const payload = { type: 'devtoolbox:sdk:request', requestId, method, params };
  window.parent.postMessage(payload, '*');
  return new Promise((resolve) => {
    pending.set(requestId, resolve as any);
    window.setTimeout(() => {
      const cb = pending.get(requestId);
      if (!cb) return;
      pending.delete(requestId);
      resolve({ ok: false, error: { code: 'timeout', message: 'SDK request timeout' } });
    }, timeoutMs);
  });
}

export const sdk = {
  system: {
    getInfo: () => callSdk('system.getInfo'),
    notify: (params: unknown) => callSdk('system.notify', params),
  },
  storage: {
    get: (key: string) => callSdk('storage.get', { key }),
    set: (key: string, value: unknown) => callSdk('storage.set', { key, value }),
  },
  log: {
    info: (message: string, data?: unknown) => callSdk('log.info', { message, data }),
  },
};
EOF

    cat >"$module_dir/src/App.tsx" <<EOF
import { useEffect, useState } from 'react';
import { sdk } from './sdk';

type Info = { platform?: string; arch?: string; appVersion?: string };

export default function App() {
  const [info, setInfo] = useState<Info | null>(null);
  const [kv, setKv] = useState('');

  useEffect(() => {
    void (async () => {
      const res = await sdk.system.getInfo();
      if (res.ok) setInfo((res.data ?? null) as any);
    })();
  }, []);

  const writeSample = async () => {
    await sdk.storage.set('sample.key', { ts: Date.now(), msg: 'hello' });
    const v = await sdk.storage.get('sample.key');
    setKv(JSON.stringify(v, null, 2));
  };

  return (
    <div className="app">
      <h1>$name</h1>
      <div className="muted">$description</div>
      <div className="card">
        <div className="row">
          <button onClick={() => void writeSample()}>Storage Sample</button>
          <button
            onClick={() =>
              void sdk.system.notify({ title: 'DevToolBox', body: 'Hello from marketplace plugin', level: 'info' })
            }
          >
            Notify
          </button>
        </div>
        <pre className="pre">{kv || 'Click "Storage Sample" to test sdk.storage'}</pre>
      </div>
      <div className="card">
        <div className="label">system.getInfo</div>
        <pre className="pre">{info ? JSON.stringify(info, null, 2) : 'Loading...'}</pre>
      </div>
    </div>
  );
}
EOF

    cat >"$module_dir/src/style.css" <<'EOF'
html,
body {
  margin: 0;
  padding: 0;
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  background: #0e1116;
  color: #e9eef5;
}

.app {
  padding: 16px;
}

.muted {
  color: rgba(233, 238, 245, 0.7);
  font-size: 13px;
  margin-top: 6px;
}

.card {
  margin-top: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
}

.row {
  display: flex;
  gap: 10px;
}

button {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #e9eef5;
  cursor: pointer;
}

button:hover {
  border-color: rgba(74, 163, 255, 0.6);
}

.label {
  font-size: 12px;
  color: rgba(233, 238, 245, 0.7);
  margin-bottom: 6px;
}

.pre {
  margin: 10px 0 0 0;
  padding: 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  overflow: auto;
  font-size: 12px;
}
EOF

    print_ok "Created marketplace plugin template: $module_dir"
    print_info "Next:"
    print_info "  pnpm install"
    print_info "  pnpm --filter @devtoolbox/plugin-$plugin_id dev"
    print_info "  ./cli.sh plugin $plugin_id"
    return
  fi

  local plugin_id="$action"
  if [[ -z "$plugin_id" ]]; then
    local ids=()
    while IFS= read -r id; do
      [[ -z "$id" ]] && continue
      ids+=("$id")
    done < <(marketplace_plugin_ids)

    if [[ ${#ids[@]} -gt 0 ]]; then
      print_info "Marketplace plugins:"
      echo "  [A] All"
      local idx=1
      for id in "${ids[@]}"; do
        local plugin_name
        plugin_name="$(marketplace_plugin_name "$id")"
        if [[ -n "$plugin_name" ]]; then
          echo "  [$idx] $id - $plugin_name"
        else
          echo "  [$idx] $id"
        fi
        idx=$((idx + 1))
      done
      echo "  [I] Input plugin ID"

      local picked
      picked="$(prompt 'Select plugin index, All, or plugin ID' '1')"
      local picked_clean
      picked_clean="$(echo "$picked" | tr -d '[:space:]')"
      local picked_lc
      picked_lc="$(echo "$picked_clean" | tr '[:upper:]' '[:lower:]')"

      if [[ "$picked_lc" == "a" || "$picked_lc" == "all" ]]; then
        plugin_id="all"
      elif [[ "$picked_lc" == "i" || "$picked_lc" == "input" ]]; then
        plugin_id="$(prompt 'Plugin ID (e.g. market-hello-tool)' '')"
      elif [[ "$picked_clean" =~ ^[0-9]+$ && "$picked_clean" -ge 1 && "$picked_clean" -le "${#ids[@]}" ]]; then
        plugin_id="${ids[$((picked_clean - 1))]}"
      else
        plugin_id="$picked_clean"
      fi
    else
      print_info "No marketplace plugins found under marketplace/modules"
      plugin_id="$(prompt 'Plugin ID (e.g. market-hello-tool)' '')"
    fi
  fi

  plugin_id="$(echo "$plugin_id" | tr -d '[:space:]')"
  local plugin_id_lc
  plugin_id_lc="$(echo "$plugin_id" | tr '[:upper:]' '[:lower:]')"
  if [[ "$plugin_id_lc" == "all" ]]; then
    local ids=()
    while IFS= read -r id; do
      [[ -z "$id" ]] && continue
      ids+=("$id")
    done < <(marketplace_plugin_ids)

    if [[ ${#ids[@]} -eq 0 ]]; then
      print_error "No marketplace plugins found under marketplace/modules"
      exit 1
    fi

    print_info "Building plugins: ${#ids[@]}"
    for id in "${ids[@]}"; do
      print_info "  build: $id"
      run_pnpm --filter "@devtoolbox/plugin-$id" build
    done
    print_ok "All plugin builds completed"

    print_info "Packing plugins into local registry zip (merge)"
    node marketplace/scripts/pack-local.mjs --merge "${ids[@]}"
    print_ok "Plugin pack completed"
    return
  fi
  if [[ -z "$plugin_id" ]]; then
    print_error "Plugin ID is required"
    exit 1
  fi
  if [[ ! "$plugin_id" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    print_error "Invalid plugin id: $plugin_id (expected kebab-case)"
    exit 1
  fi
  if [[ ! "$plugin_id" =~ ^market- ]]; then
    print_error "Invalid plugin id: $plugin_id (must start with market-)"
    exit 1
  fi
  if [[ ! -d "marketplace/modules/$plugin_id" ]]; then
    print_error "Plugin not found: marketplace/modules/$plugin_id"
    exit 1
  fi

  print_info "Building plugin: $plugin_id"
  run_pnpm --filter "@devtoolbox/plugin-$plugin_id" build
  print_ok "Plugin build completed"

  print_info "Packing plugin into local registry zip (merge): $plugin_id"
  node marketplace/scripts/pack-local.mjs --merge "$plugin_id"
  print_ok "Plugin pack completed"
}

cmd_package() {
  local platform="${1:-}"
  local arch="${2:-}"
  if [[ -z "$platform" ]]; then
    platform="$(prompt 'Platform (macos/windows)' 'macos')"
  fi
  case "$platform" in
    macos|windows) ;;
    all) print_error "Tauri builds are per-OS. Run macos on macOS and windows on Windows, or use the release workflow."; exit 1 ;;
    *) print_error "Invalid platform: $platform"; exit 1 ;;
  esac

  if [[ "$platform" == "macos" && -z "$arch" ]]; then
    arch="$(prompt 'Arch (arm64/x64/universal, empty for default)' '')"
  fi
  if [[ -n "$arch" ]]; then
    case "$arch" in
      arm64|x64|universal) ;;
      *) print_error "Invalid arch: $arch"; exit 1 ;;
    esac
  fi

  ensure_cmd cargo
  ensure_pnpm

  local bundles="app,dmg"
  local target=""
  if [[ "$platform" == "windows" ]]; then
    bundles="nsis"
  fi
  case "$arch" in
    arm64) target="aarch64-apple-darwin" ;;
    x64) target="x86_64-apple-darwin" ;;
    universal) target="universal-apple-darwin" ;;
    "") ;;
  esac

  local args=(--bundles "$bundles")
  if [[ -n "$target" ]]; then
    args+=(--target "$target")
  fi

  unset NODE_OPTIONS
  print_info "Packaging with Tauri ($platform${arch:+/$arch})..."
  run_pnpm --filter "@devtoolbox/desktop" tauri build "${args[@]}"
  print_ok "Packaging completed"

  local output_dir="target/release/bundle"
  if [[ -d "$output_dir" ]]; then
    print_info "Artifacts under $output_dir:"
    find "$output_dir" -maxdepth 2 -type f \( -name "*.dmg" -o -name "*.exe" -o -name "*.app.tar.gz" \) 2>/dev/null || true
  fi
}

cmd_check() {
  ensure_pnpm
  run_pnpm lint
  run_pnpm typecheck
  run_pnpm test

  if command -v cargo >/dev/null 2>&1; then
    print_info "Checking Rust workspace"
    cargo fmt --all -- --check
    cargo clippy -p devtoolbox-contract -p devtoolbox-capability -p devtoolbox-market --all-targets -- -D warnings
    cargo test -p devtoolbox-contract -p devtoolbox-capability -p devtoolbox-market
  else
    print_info "Skipping Rust checks (cargo not found)"
  fi

  print_ok "Checks passed"
}

cmd_tool_new() {
  ensure_pnpm
  run_pnpm new:tool
}

main() {
  local cmd="${1:-help}"
  shift || true

  case "$cmd" in
    help|-h|--help) usage ;;
    doctor) cmd_doctor ;;
    dev) cmd_dev ;;
    build) cmd_build ;;
    clear) cmd_clear ;;
    plugin) cmd_plugin "$@" ;;
    package) cmd_package "$@" ;;
    check) cmd_check ;;
    tool)
      local sub="${1:-}"
      shift || true
      case "$sub" in
        new) cmd_tool_new ;;
        *) print_error "Unknown tool subcommand: ${sub:-}"; usage; exit 1 ;;
      esac
      ;;
    *) print_error "Unknown command: $cmd"; usage; exit 1 ;;
  esac
}

main "$@"
