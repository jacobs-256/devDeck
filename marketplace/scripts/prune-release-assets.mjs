import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';

function readJson(p) {
  const raw = fs.readFileSync(p, 'utf-8');
  return JSON.parse(raw);
}

async function ghFetch(url, token, init = {}) {
  const headers = {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    ...(init.headers ?? {}),
  };
  const res = await fetch(url, { ...init, headers });
  return res;
}

async function main() {
  const repo = String(process.env.GITHUB_REPOSITORY ?? '').trim();
  const token = String(process.env.GITHUB_TOKEN ?? '').trim();
  const tag = String(process.env.MARKETPLACE_TAG ?? '').trim();
  const keepPath = process.argv[2] ? path.resolve(process.argv[2]) : '';

  if (!repo) throw new Error('Missing env GITHUB_REPOSITORY');
  if (!token) throw new Error('Missing env GITHUB_TOKEN');
  if (!tag) throw new Error('Missing env MARKETPLACE_TAG');
  if (!keepPath) throw new Error('Missing keep list path argument');
  if (!fs.existsSync(keepPath)) throw new Error(`Keep list not found: ${keepPath}`);

  const keep = readJson(keepPath);
  const zips = Array.isArray(keep?.zips) ? keep.zips.filter((x) => typeof x === 'string') : [];
  const keepSet = new Set(zips);

  const releaseUrl = `https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`;
  const relRes = await ghFetch(releaseUrl, token);
  if (relRes.status === 404) {
    process.stdout.write(`No existing release for tag "${tag}". Skip pruning.\n`);
    return;
  }
  if (!relRes.ok) throw new Error(`Failed to fetch release: ${relRes.status} ${await relRes.text()}`);
  const release = await relRes.json();
  const assets = Array.isArray(release?.assets) ? release.assets : [];

  const toDelete = assets
    .map((a) => ({
      id: typeof a?.id === 'number' ? a.id : null,
      name: typeof a?.name === 'string' ? a.name : '',
    }))
    .filter((a) => a.id !== null && a.name.endsWith('.zip') && !keepSet.has(a.name));

  if (!toDelete.length) {
    process.stdout.write('No stale zip assets to delete.\n');
    return;
  }

  for (const a of toDelete) {
    const delUrl = `https://api.github.com/repos/${repo}/releases/assets/${a.id}`;
    const delRes = await ghFetch(delUrl, token, { method: 'DELETE' });
    if (!delRes.ok)
      throw new Error(`Failed to delete asset "${a.name}": ${delRes.status} ${await delRes.text()}`);
    process.stdout.write(`Deleted stale asset: ${a.name}\n`);
  }
}

main().catch((e) => {
  process.stderr.write(`${e?.message ? e.message : String(e)}\n`);
  process.exit(1);
});
