#!/usr/bin/env node
/**
 * Build a schema-2 `registry.json` from packaged plugin ZIPs.
 *
 *   node scripts/registry.mjs --all
 *   node scripts/registry.mjs market-ip-lookup --base-url https://example.com/marketplace
 *
 * Inputs:
 *   modules/<id>/manifest.json
 *   .local-dist/<id>-<version>.zip          (from `pnpm pack`)
 *   .local-dist/<id>-<version>.zip.sig      (optional, from `pnpm sign`)
 *
 * The Rust crate `devtoolbox-market` is the authoritative validator at install
 * time; this script performs the same structural checks early so a broken
 * release fails before it is published.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const modulesDir = path.join(root, 'modules');
const distDir = path.join(root, '.local-dist');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function validateManifest(manifest, id) {
  const problems = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest is not an object'];

  if (manifest.id !== id) problems.push(`manifest.id must equal folder name '${id}'`);
  if (!SLUG.test(String(manifest.id ?? ''))) problems.push('id must be a lowercase slug');
  if (!manifest.name || String(manifest.name).length > 64) problems.push('name must be 1-64 chars');
  if (!SEMVER.test(String(manifest.version ?? ''))) problems.push('version must be SemVer');
  if (!manifest.entry || !String(manifest.entry).endsWith('.html'))
    problems.push('entry must be an .html file');
  if (!SLUG.test(String(manifest.categoryId ?? ''))) problems.push('categoryId must be a lowercase slug');
  if (!manifest.license) problems.push('license is required');

  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  if (new Set(permissions).size !== permissions.length) problems.push('permissions contain duplicates');

  const usesHttp = permissions.includes('http:proxy') || permissions.includes('http:external');
  const httpDomains = Array.isArray(manifest.httpDomains) ? manifest.httpDomains : [];
  if (usesHttp && httpDomains.length === 0) {
    problems.push('httpDomains is required when an http permission is declared');
  }
  for (const domain of httpDomains) {
    if (typeof domain !== 'string' || !/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain)) {
      problems.push(`invalid httpDomain: ${domain}`);
    }
  }
  if (permissions.includes('system:env:read') && !(manifest.envAllowlist ?? []).length) {
    problems.push('envAllowlist is required with system:env:read');
  }
  return problems;
}

function parseArgs(argv) {
  const ids = [];
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=');
      if (inline !== undefined) flags.set(name, inline);
      else {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) flags.set(name, true);
        else {
          flags.set(name, value);
          i += 1;
        }
      }
    } else {
      ids.push(arg);
    }
  }
  return { ids, flags };
}

const { ids, flags } = parseArgs(process.argv.slice(2));
const all = flags.has('all');
const baseUrl = typeof flags.get('base-url') === 'string' ? flags.get('base-url').replace(/\/+$/, '') : '';
const outFile = path.resolve(
  root,
  typeof flags.get('out') === 'string' ? flags.get('out') : 'release-dist/registry.json',
);
const registryName = typeof flags.get('name') === 'string' ? flags.get('name') : 'DevToolBox Local Registry';

const resolvedIds = all
  ? fs.readdirSync(modulesDir).filter((name) => fs.existsSync(path.join(modulesDir, name, 'manifest.json')))
  : ids;

if (!resolvedIds.length) {
  fail('usage: registry.mjs [--all] [--base-url <url>] [--out <file>] <plugin-id...>');
}

const problems = [];
const entries = [];

for (const id of resolvedIds) {
  const manifestPath = path.join(modulesDir, id, 'manifest.json');
  if (!fs.existsSync(manifestPath)) fail(`missing manifest: ${manifestPath}`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const manifestProblems = validateManifest(manifest, id);
  if (manifestProblems.length) {
    problems.push(`${id}: ${manifestProblems.join('; ')}`);
    continue;
  }

  const zipName = `${id}-${manifest.version}.zip`;
  const zipPath = path.join(distDir, zipName);
  if (!fs.existsSync(zipPath)) {
    problems.push(`${id}: package not found (${zipPath}); run \`pnpm pack ${id}\` first`);
    continue;
  }

  const sha256 = sha256File(zipPath);
  const size = fs.statSync(zipPath).size;
  const sigPath = `${zipPath}.sig`;
  let signature;
  if (fs.existsSync(sigPath)) {
    if (fs.statSync(sigPath).mtimeMs < fs.statSync(zipPath).mtimeMs) {
      problems.push(`${id}: ${sigPath} is older than the package; re-sign it`);
    }
    const envelope = JSON.parse(fs.readFileSync(sigPath, 'utf8'));
    if (!envelope.keyId || !envelope.signature) {
      problems.push(`${id}: ${sigPath} is missing keyId/signature`);
    } else {
      signature = { keyId: envelope.keyId, signature: envelope.signature };
    }
  }

  const downloadUrl = baseUrl ? `${baseUrl}/${zipName}` : pathToFileURL(zipPath).toString();

  entries.push({
    manifest: { ...manifest, schemaVersion: manifest.schemaVersion ?? 2 },
    downloadUrl,
    sha256,
    size,
    publishedAt: new Date().toISOString(),
    status: 'active',
    ...(signature ? { signature } : {}),
  });
}

if (problems.length) {
  console.error('registry validation failed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

entries.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id));
const registry = {
  schemaVersion: 2,
  name: registryName,
  updatedAt: new Date().toISOString(),
  plugins: entries,
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
console.log(`registry written: ${outFile} (${entries.length} release(s))`);
