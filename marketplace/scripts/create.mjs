#!/usr/bin/env node
/**
 * Scaffold a DevToolBox Marketplace plugin.
 *
 *   pnpm --filter @devtoolbox/marketplace create --id market-my-tool --name "My Tool"
 *
 * Options:
 *   --id <slug>            required, lowercase slug (e.g. market-my-tool)
 *   --name <name>          display name (default: derived from id)
 *   --description <text>   one-line description
 *   --category <slug>      categoryId (default: text-tools)
 *   --author <name>        author name (default: Your Name)
 *   --license <spdx>       license identifier (default: MIT)
 *   --permissions <list>   comma-separated permissions (default: storage:kv)
 *   --dir <path>           output directory, relative to marketplace/ (default: modules)
 *   --force                overwrite an existing directory
 *
 * The generated plugin targets SDK 2.0 and builds into `package/`, ready for
 * `pnpm --filter @devtoolbox/marketplace pack <id>`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const marketplaceRoot = path.resolve(__dirname, '..');

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const DEFAULT_CATEGORY = 'text-tools';

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [name, inline] = arg.slice(2).split('=');
    if (inline !== undefined) {
      flags.set(name, inline);
    } else {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        flags.set(name, true);
      } else {
        flags.set(name, value);
        index += 1;
      }
    }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));

if (flags.has('help')) {
  console.log(
    'usage: create.mjs --id <market-slug> [--name <name>] [--description <text>] [--category <slug>]\n' +
      '                  [--author <name>] [--license <spdx>] [--permissions <a,b>] [--dir <path>] [--force]',
  );
  process.exit(0);
}

const id = String(flags.get('id') ?? '').trim();
if (!id) fail('--id is required (for example: --id market-my-tool)');
if (!SLUG.test(id)) {
  fail(`"${id}" is not a valid plugin id; use lowercase letters, digits, and single hyphens`);
}
if (!id.startsWith('market-')) {
  console.warn('warning: convention is to prefix community plugin ids with "market-"');
}

const name = String(flags.get('name') ?? '').trim() || id.replace(/^market-/, '').replace(/-/g, ' ');
const description = String(flags.get('description') ?? '').trim() || `A DevToolBox plugin for ${name}.`;
const category = String(flags.get('category') ?? DEFAULT_CATEGORY).trim();
const author = String(flags.get('author') ?? '').trim() || 'Your Name';
const license = String(flags.get('license') ?? 'MIT').trim() || 'MIT';
const permissions = String(flags.get('permissions') ?? 'storage:kv')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const force = flags.has('force');

if (!SLUG.test(category)) fail(`"${category}" is not a valid categoryId slug`);

const outRoot = path.resolve(marketplaceRoot, String(flags.get('dir') ?? 'modules'));
const outDir = path.join(outRoot, id);

if (fs.existsSync(outDir) && !force) {
  fail(`${outDir} already exists (pass --force to overwrite)`);
}

const usesHttp = permissions.some((permission) => permission.startsWith('http:'));
const usesEnv = permissions.includes('system:env:read');

const manifest = {
  schemaVersion: 2,
  id,
  name,
  description,
  version: '0.1.0',
  sdkVersion: '2.0',
  entry: 'package/index.html',
  categoryId: category,
  author: { name: author },
  license,
  permissions,
  httpDomains: usesHttp ? ['api.example.com'] : [],
  envAllowlist: usesEnv ? ['HOME'] : [],
};

const packageJson = {
  name: `@devtoolbox/plugin-${id}`,
  private: true,
  version: '0.1.0',
  type: 'module',
  scripts: {
    dev: 'vite',
    build: 'tsc -p tsconfig.json --noEmit && vite build',
  },
  dependencies: {
    '@devtoolbox/plugin-sdk': 'workspace:*',
    react: '^18.3.1',
    'react-dom': '^18.3.1',
  },
  devDependencies: {
    '@types/react': '^18.3.12',
    '@types/react-dom': '^18.3.1',
    '@vitejs/plugin-react': '^4.3.4',
    typescript: '^5.6.3',
    vite: '^6.0.5',
  },
};

const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES2022', 'DOM', 'DOM.Iterable'],
    module: 'ESNext',
    moduleResolution: 'bundler',
    jsx: 'react-jsx',
    strict: true,
    noUncheckedIndexedAccess: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    skipLibCheck: true,
    isolatedModules: true,
    noEmit: true,
  },
  include: ['src'],
};

const files = {
  'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
  'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
  'tsconfig.json': `${JSON.stringify(tsconfig, null, 2)}\n`,
  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { outDir: 'package', emptyOutDir: true },
});
`,
  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import { followHostTheme } from '@devtoolbox/plugin-sdk';
import App from './App';
import './style.css';

// Keeps the plugin in sync with the host light/dark theme.
followHostTheme();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`,
  'src/App.tsx': `import { useEffect, useState } from 'react';
import { sdk } from '@devtoolbox/plugin-sdk';

const STORAGE_KEY = '${id}.notes';

export default function App() {
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    void sdk.storage.get<string>(STORAGE_KEY).then((result) => {
      if (!result.ok) {
        setStatus(\`storage unavailable (\${result.error.code})\`);
        return;
      }
      setNote(result.data?.value ?? '');
    });
  }, []);

  const save = async () => {
    const result = await sdk.storage.set(STORAGE_KEY, note);
    setStatus(result.ok ? 'saved' : \`error: \${result.error.code}\`);
  };

  return (
    <main className="plugin">
      <h1>${name}</h1>
      <p className="muted">Replace this with your tool. Storage is scoped to this plugin.</p>
      <textarea value={note} rows={6} onChange={(event) => setNote(event.target.value)} />
      <div className="row">
        <button type="button" onClick={() => void save()}>
          Save
        </button>
        <span className="muted">{status}</span>
      </div>
    </main>
  );
}
`,
  'src/style.css': `:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --text: #171a21;
  --muted: #5d6675;
  --border: #dfe3ea;
  --accent: #2563eb;
}

:root[data-theme='dark'] {
  --bg: #0f1115;
  --text: #e6e8ec;
  --muted: #9aa1ad;
  --border: #2a2f3a;
  --accent: #4f8cff;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 20px;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.plugin {
  max-width: 640px;
  margin: 0 auto;
}

h1 {
  font-size: 18px;
  margin: 0 0 6px;
}

.muted {
  color: var(--muted);
  font-size: 12px;
}

textarea {
  width: 100%;
  margin: 12px 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: transparent;
  color: var(--text);
  font: inherit;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

button {
  padding: 7px 14px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  cursor: pointer;
}
`,
  'README.md': `# ${name}

DevToolBox Marketplace plugin (\`${id}\`).

## Develop

\`\`\`bash
pnpm install
pnpm dev          # Vite preview; SDK calls only work inside DevToolBox
pnpm build        # emits package/
\`\`\`

## Package and install

From the DevToolBox repository:

\`\`\`bash
pnpm --filter @devtoolbox/marketplace pack ${id}
pnpm --filter @devtoolbox/marketplace registry ${id} --out release-dist/registry.json
\`\`\`

Then add the registry URL in **Marketplace** and install the plugin from the
catalog.

## Permissions

This plugin declares: ${permissions.length > 0 ? permissions.join(', ') : '(none)'}.

Every capability must be declared in \`manifest.json\`; the host denies anything
else at runtime.
`,
};

fs.rmSync(outDir, { recursive: true, force: true });
for (const [relativePath, content] of Object.entries(files)) {
  const target = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

console.log(`plugin scaffolded: ${outDir}`);
console.log('');
console.log('Next steps:');
console.log(`  pnpm install --filter @devtoolbox/plugin-${id}`);
console.log(`  pnpm --filter @devtoolbox/plugin-${id} build`);
console.log(`  pnpm --filter @devtoolbox/marketplace pack ${id}`);
console.log('');
console.log(
  `Permissions: ${permissions.length > 0 ? permissions.join(', ') : 'none'}` +
    (usesHttp ? ` (httpDomains: ${manifest.httpDomains.join(', ')})` : ''),
);
