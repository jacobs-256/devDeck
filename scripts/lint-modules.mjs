import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function listDirs(p) {
  const entries = await readdir(p, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function listFiles(p) {
  const entries = await readdir(p, { withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => e.name);
}

async function lintBase(baseDir) {
  const folders = await listDirs(baseDir);
  const modules = [];
  for (const folderName of folders) {
    const moduleDir = path.join(baseDir, folderName);
    const files = await listFiles(moduleDir);
    const configName = files.includes('config.tsx')
      ? 'config.tsx'
      : files.includes('config.ts')
        ? 'config.ts'
        : '';
    if (!configName) continue;
    modules.push({ folderName, moduleDir, configPath: path.join(moduleDir, configName) });
  }
  return modules;
}

function extractId(configText) {
  const m = configText.match(/id:\s*['"`]([^'"`]+)['"`]/);
  return m?.[1];
}

function extractCategoryId(configText) {
  const m = configText.match(/categoryId:\s*['"`]([^'"`]+)['"`]/);
  return m?.[1];
}

function isKebabCaseId(id) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
}

async function getCategoryIds() {
  const placeholderPath = path.join(rootDir, 'core/renderer/data/placeholder.ts');
  const raw = await readFile(placeholderPath, 'utf8');
  const ids = new Set();
  for (const m of raw.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*icon:/g)) {
    ids.add(m[1]);
  }
  return Array.from(ids);
}

async function checkModule(moduleDir, folderName) {
  const errors = [];
  const files = await listFiles(moduleDir);
  const hasIndex = files.includes('index.tsx');
  const hasCss = files.some((f) => f.endsWith('.module.css'));
  const localesDir = path.join(moduleDir, 'locales');
  let hasLocales = false;
  try {
    const localeFiles = await listFiles(localesDir);
    hasLocales = localeFiles.includes('en.ts');
  } catch {
    hasLocales = false;
  }

  if (!hasIndex) errors.push('Missing index.tsx');
  if (!hasCss) errors.push('Missing *.module.css');
  if (!hasLocales) errors.push('Missing locales/en.ts');

  const configPath = path.join(moduleDir, files.includes('config.tsx') ? 'config.tsx' : 'config.ts');
  const raw = await readFile(configPath, 'utf8');
  const id = extractId(raw);
  const categoryId = extractCategoryId(raw);

  if (!id) errors.push('config is missing the `id` field');
  if (!categoryId) errors.push('config is missing the `categoryId` field');
  if (id && !isKebabCaseId(id)) errors.push(`id must be kebab-case: ${id}`);
  if (id && !id.startsWith('core-')) errors.push(`id must start with "core-": ${id}`);

  return { folderName, id, categoryId, errors };
}

async function main() {
  const toolBase = path.join(rootDir, 'core/renderer/components/ModuleTools');
  const modules = [...(await lintBase(toolBase)).map((m) => ({ ...m, scope: 'ModuleTools' }))];

  const idMap = new Map();
  const allErrors = [];
  const categoryIds = await getCategoryIds();

  for (const m of modules) {
    const res = await checkModule(m.moduleDir, m.folderName);
    if (res.id) {
      const prev = idMap.get(res.id);
      if (prev) {
        allErrors.push(`Duplicate id: ${res.id} (${prev} and ${m.scope}/${m.folderName})`);
      } else {
        idMap.set(res.id, `${m.scope}/${m.folderName}`);
      }
    }

    if (res.categoryId && !categoryIds.includes(res.categoryId)) {
      allErrors.push(`${m.scope}/${m.folderName}: unknown categoryId: ${res.categoryId}`);
    }

    for (const e of res.errors) {
      allErrors.push(`${m.scope}/${m.folderName}: ${e}`);
    }
  }

  if (allErrors.length) {
    process.stderr.write(allErrors.map((e) => `- ${e}`).join('\n') + '\n');
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Module validation passed (${modules.length} modules).\n`);
}

main().catch((err) => {
  process.stderr.write(`${String(err?.stack || err)}\n`);
  process.exitCode = 1;
});
