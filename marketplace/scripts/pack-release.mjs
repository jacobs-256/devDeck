import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

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

const repo = String(process.env.GITHUB_REPOSITORY ?? '').trim();
const downloadBase = String(process.env.MARKETPLACE_DOWNLOAD_BASE_URL ?? '')
  .trim()
  .replace(/\/$/, '');
if (!repo && !downloadBase) {
  console.error(
    'Missing env GITHUB_REPOSITORY (expected like "owner/repo") or MARKETPLACE_DOWNLOAD_BASE_URL',
  );
  process.exit(1);
}

const tag = String(process.env.MARKETPLACE_TAG ?? 'marketplace').trim();
if (!tag) {
  console.error('Missing env MARKETPLACE_TAG');
  process.exit(1);
}

const signingKey = String(process.env.DEVDECK_SIGNING_KEY ?? process.env.DEVTOOLBOX_SIGNING_KEY ?? '').trim();

const outDir = path.join(root, 'release-dist');
rmrf(outDir);
fs.mkdirSync(outDir, { recursive: true });

function writeEmptyRegistry() {
  const registry = { schemaVersion: 1, plugins: [] };
  const registryPath = path.join(outDir, 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  process.stdout.write(`No marketplace modules found. Empty registry written: ${registryPath}\n`);
}

if (!fs.existsSync(modulesDir)) {
  writeEmptyRegistry();
  process.exit(0);
}

const ids = process.argv.slice(2);
const resolvedIds = ids.length
  ? ids
  : fs.readdirSync(modulesDir).filter((n) => fs.statSync(path.join(modulesDir, n)).isDirectory());
if (!resolvedIds.length) {
  writeEmptyRegistry();
  process.exit(0);
}

const entries = [];

for (const id of resolvedIds) {
  const pluginDir = path.join(modulesDir, id);
  const manifestPath = path.join(pluginDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`manifest.json not found: ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const version = String(manifest.version || '').trim();
  if (!version) throw new Error(`Invalid manifest.version for ${id}`);

  const entry = String(manifest.entry || '').trim();
  if (!entry) throw new Error(`Invalid manifest.entry for ${id}`);

  const builtEntryPath = path.join(pluginDir, entry);
  if (!fs.existsSync(builtEntryPath)) {
    throw new Error(
      `Entry not built yet: ${builtEntryPath}. Run pnpm --filter @devdeck/plugin-${id} build`,
    );
  }

  const staging = path.join(outDir, `${id}-${version}`);
  rmrf(staging);
  fs.mkdirSync(staging, { recursive: true });
  fs.copyFileSync(manifestPath, path.join(staging, 'manifest.json'));

  const entryRoot = entry.split('/')[0];
  const entryRootPath = path.join(pluginDir, entryRoot);
  if (!fs.existsSync(entryRootPath)) throw new Error(`Entry root not found: ${entryRootPath}`);
  copyDir(entryRootPath, path.join(staging, entryRoot));

  const zipName = `${id}-${version}.zip`;
  const zipPath = path.join(outDir, zipName);
  rmrf(zipPath);
  rmrf(`${zipPath}.sig`);
  execFileSync('zip', ['-qr', zipPath, 'manifest.json', entryRoot], { cwd: staging, stdio: 'inherit' });

  let signature;
  if (signingKey) {
    execFileSync(process.execPath, [path.join(__dirname, 'sign.mjs'), 'sign', zipPath], {
      stdio: 'inherit',
      env: process.env,
    });
    const envelope = JSON.parse(fs.readFileSync(`${zipPath}.sig`, 'utf8'));
    signature = { keyId: envelope.keyId, signature: envelope.signature };
  }

  const sha256 = sha256File(zipPath);
  const size = fs.statSync(zipPath).size;
  const downloadUrl = downloadBase
    ? `${downloadBase}/${zipName}`
    : `https://github.com/${repo}/releases/download/${tag}/${zipName}`;

  entries.push({
    manifest: { ...manifest },
    downloadUrl,
    sha256,
    size,
    publishedAt: new Date().toISOString(),
    status: 'active',
    ...(signature ? { signature } : {}),
  });
}

const registry = { schemaVersion: signingKey ? 2 : 1, plugins: entries };
const registryPath = path.join(outDir, 'registry.json');
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf-8');
process.stdout.write(`Marketplace release artifacts ready: ${outDir}\n`);
