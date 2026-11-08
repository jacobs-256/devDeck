import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    return;
  }
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const sp = path.join(src, name);
    const dp = path.join(dest, name);
    const stat = fs.statSync(sp);
    if (stat.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const modulesDir = path.join(root, 'modules');

const args = process.argv.slice(2).filter((x) => x && x !== '--');
const merge = args.includes('--merge');
const all = args.includes('--all');

let ids = args.filter((x) => !x.startsWith('--'));
if (all) {
  ids = fs
    .readdirSync(modulesDir)
    .filter((name) => name && name.startsWith('market-'))
    .filter((name) => fs.existsSync(path.join(modulesDir, name, 'manifest.json')));
}

if (!ids.length) {
  console.error(
    'Usage: node marketplace/scripts/pack-local.mjs [--all] [--merge] <plugin-id> [plugin-id...]',
  );
  process.exit(1);
}

const outDir = path.join(root, '.local-dist');
fs.mkdirSync(outDir, { recursive: true });

const entries = [];

for (const id of ids) {
  const pluginDir = path.join(modulesDir, id);
  const manifestPath = path.join(pluginDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`manifest.json not found: ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const version = String(manifest.version || '').trim();
  if (!version) throw new Error(`Invalid manifest.version for ${id}`);

  const builtEntryPath = path.join(pluginDir, String(manifest.entry || ''));
  if (!fs.existsSync(builtEntryPath)) {
    throw new Error(
      `Entry not built yet: ${builtEntryPath}. Run pnpm --filter @devdeck/plugin-${id} build`,
    );
  }

  const staging = path.join(outDir, `${id}-${version}`);
  rmrf(staging);
  fs.mkdirSync(staging, { recursive: true });
  fs.copyFileSync(manifestPath, path.join(staging, 'manifest.json'));

  const entryRoot = String(manifest.entry).split('/')[0];
  const entryRootPath = path.join(pluginDir, entryRoot);
  if (!fs.existsSync(entryRootPath)) throw new Error(`Entry root not found: ${entryRootPath}`);
  const destRootPath = path.join(staging, entryRoot);
  copyDir(entryRootPath, destRootPath);

  const zipPath = path.join(outDir, `${id}-${version}.zip`);
  rmrf(zipPath);
  // Repacking invalidates any previous signature for this version.
  rmrf(`${zipPath}.sig`);
  execFileSync('zip', ['-qr', zipPath, 'manifest.json', entryRoot], { cwd: staging, stdio: 'inherit' });

  const sha256 = sha256File(zipPath);
  const size = fs.statSync(zipPath).size;
  const downloadUrl = pathToFileURL(zipPath).toString();

  entries.push({
    manifest: { ...manifest },
    downloadUrl,
    sha256,
    size,
    publishedAt: new Date().toISOString(),
    status: 'active',
  });
}

const registryPath = path.join(root, 'registry.local.json');
let plugins = entries;
if (merge && fs.existsSync(registryPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
    const list = Array.isArray(existing?.plugins) ? existing.plugins : [];
    const map = new Map(list.map((e) => [e?.manifest?.id, e]).filter(([id]) => Boolean(id)));
    for (const e of entries) map.set(e.manifest.id, e);
    plugins = Array.from(map.values()).sort((a, b) =>
      String(a.manifest.id).localeCompare(String(b.manifest.id)),
    );
  } catch {
    plugins = entries;
  }
}

const registry = { schemaVersion: 1, plugins };
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');

console.log(`Local registry written: ${pathToFileURL(registryPath).toString()}`);
