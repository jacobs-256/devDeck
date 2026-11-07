#!/usr/bin/env node
// Guard: the Tauri app, SDK, and marketplace modules must never import the
// frozen Electron implementation under core/. Keeps the rewrite decoupled until
// the legacy tree is deleted.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SCAN_DIRS = [
  path.join(root, 'apps/desktop/src'),
  path.join(root, 'apps/desktop/src-tauri/src'),
  path.join(root, 'packages/plugin-sdk/src'),
  path.join(root, 'marketplace/modules'),
];

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'target', '.git']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.rs']);

const SPECIFIER = /(?:from\s*|import\s*\(?\s*|require\s*\(\s*|^\s*use\s+)['"]([^'"]+)['"]/gm;
const LEGACY_SPECIFIER = /(^|\/)core\//;
const ELECTRON_SPECIFIER = /^(electron|electron\/.+|@electron\/.+)$/;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full, files);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

const violations = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(SPECIFIER)) {
      const specifier = match[1];
      if (LEGACY_SPECIFIER.test(specifier) || ELECTRON_SPECIFIER.test(specifier)) {
        const line = source.slice(0, match.index).split('\n').length;
        violations.push({
          file: path.relative(root, file),
          line,
          specifier,
        });
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Legacy imports found in the Tauri implementation:\n');
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  ${violation.specifier}`);
  }
  console.error('\nThe new architecture must not depend on core/ or Electron.');
  process.exit(1);
}

console.log('No legacy imports (core/, electron) in the Tauri app, SDK, or marketplace modules.');
