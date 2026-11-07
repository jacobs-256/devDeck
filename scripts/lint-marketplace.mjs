import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function isRecord(v) {
  return typeof v === 'object' && v !== null;
}

function isKebabCaseId(id) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

async function listDirs(p) {
  try {
    const entries = await readdir(p, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function main() {
  const baseDir = path.join(rootDir, 'marketplace/modules');
  const folders = await listDirs(baseDir);
  const errors = [];

  for (const folder of folders) {
    const manifestPath = path.join(baseDir, folder, 'manifest.json');
    let raw = '';
    try {
      raw = await readFile(manifestPath, 'utf8');
    } catch {
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch {
      errors.push(`marketplace/${folder}: invalid manifest.json`);
      continue;
    }

    const id = isRecord(manifest) ? manifest.id : '';
    if (typeof id !== 'string' || !id.trim()) {
      errors.push(`marketplace/${folder}: manifest.id is missing`);
      continue;
    }
    if (!isKebabCaseId(id)) errors.push(`marketplace/${folder}: manifest.id must be kebab-case: ${id}`);
    if (!id.startsWith('market-'))
      errors.push(`marketplace/${folder}: manifest.id must start with "market-": ${id}`);
  }

  if (errors.length) {
    process.stderr.write(errors.map((e) => `- ${e}`).join('\n') + '\n');
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Marketplace validation passed (${folders.length} modules).\n`);
}

main().catch((err) => {
  process.stderr.write(`${String(err?.stack || err)}\n`);
  process.exitCode = 1;
});
