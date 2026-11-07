import { readFile, writeFile } from 'node:fs/promises';

async function readJson(p) {
  const raw = await readFile(p, 'utf8');
  return JSON.parse(raw);
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

function yymmddUtc() {
  const d = new Date();
  const yy = String(d.getUTCFullYear()).slice(-2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function extractBuildNumbers(text) {
  if (!text) return [];
  const out = [];
  const re = /\b(\d{6})(\d{3})\b/g;
  for (const m of String(text).matchAll(re)) {
    out.push({ date: m[1], seq: Number(m[2]) });
  }
  return out;
}

async function fetchReleases(repo, token) {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=100`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function compute({ repo, token, inputVersion, inputBuild, inputTag }) {
  const pkg = await readJson('package.json');
  const pkgVersion = String(pkg.version || '').trim();
  const baseFromPkg = pkgVersion ? pkgVersion.split('-')[0] : '';
  const version = String(inputVersion || '').trim() || baseFromPkg;
  if (!version) throw new Error('Missing version');

  const buildInput = String(inputBuild || '').trim();
  let build = buildInput;
  if (!build) {
    const today = yymmddUtc();
    const releases = await fetchReleases(repo, token);
    let maxSeq = 0;
    for (const r of releases) {
      const candidates = [
        ...extractBuildNumbers(r?.tag_name),
        ...extractBuildNumbers(r?.name),
        ...extractBuildNumbers(r?.body),
      ];
      for (const c of candidates) {
        if (c.date === today && Number.isFinite(c.seq)) maxSeq = Math.max(maxSeq, c.seq);
      }
    }
    build = `${today}${pad3(maxSeq + 1)}`;
  }

  const tag = String(inputTag || '').trim() || `${version}-${build}`;
  return { version, build, tag };
}

async function apply({ version, build }) {
  const pkgPath = 'package.json';
  const pkg = await readJson(pkgPath);
  const fullVersion = version.endsWith(`-${build}`) ? version : `${version}-${build}`;
  pkg.version = fullVersion;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  const mainPath = 'core/main/index.ts';
  const raw = await readFile(mainPath, 'utf8');
  const next = raw.replace(/const BUILD_NUMBER = '([^']*)';/, `const BUILD_NUMBER = '${build}';`);
  if (next === raw) throw new Error('Failed to update BUILD_NUMBER');
  await writeFile(mainPath, next, 'utf8');
}

async function main() {
  const cmd = process.argv[2];
  if (cmd !== 'compute' && cmd !== 'apply') {
    process.stderr.write('Usage: node scripts/release-vars.mjs <compute|apply>\n');
    process.exit(1);
  }

  if (cmd === 'compute') {
    const repo = process.env.GITHUB_REPOSITORY || '';
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    const inputVersion = process.env.INPUT_VERSION || '';
    const inputBuild = process.env.INPUT_BUILD || '';
    const inputTag = process.env.INPUT_TAG || '';
    if (!repo) throw new Error('Missing GITHUB_REPOSITORY');
    if (!token) throw new Error('Missing GITHUB_TOKEN');
    const { version, build, tag } = await compute({ repo, token, inputVersion, inputBuild, inputTag });
    process.stdout.write(`version=${version}\n`);
    process.stdout.write(`build=${build}\n`);
    process.stdout.write(`tag=${tag}\n`);
  } else {
    const version = String(process.env.RELEASE_VERSION || '').trim();
    const build = String(process.env.RELEASE_BUILD || '').trim();
    if (!version) throw new Error('Missing RELEASE_VERSION');
    if (!build) throw new Error('Missing RELEASE_BUILD');
    await apply({ version, build });
  }
}

main().catch((e) => {
  process.stderr.write(`${e?.message ? e.message : String(e)}\n`);
  process.exit(1);
});
