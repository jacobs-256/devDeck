#!/usr/bin/env node
// Verify a Tauri updater artifact signature (minisign format) without the app.
//
//   node scripts/verify-updater-artifact.mjs \
//     --artifact path/to/App.app.tar.gz \
//     --signature path/to/App.app.tar.gz.sig \
//     --pubkey "$(node -p "require('./apps/desktop/src-tauri/tauri.conf.json').plugins.updater.pubkey")"
//
// Supports both minisign modes: Ed (direct signature) and ED (BLAKE2b-512).

import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';

const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function readFlag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index + 1 >= process.argv.length) fail(`missing --${name}`);
  return process.argv[index + 1];
}

function parseKeyId(buffer) {
  return buffer.subarray(2, 10).toString('hex').toUpperCase();
}

function parsePublicKey(pubkeyBase64) {
  let text = Buffer.from(pubkeyBase64.trim(), 'base64').toString('utf8');
  if (!text.includes('minisign public key')) {
    // Allow passing the plain public key file contents too.
    text = pubkeyBase64;
  }
  const line = text
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry && !entry.startsWith('untrusted comment:'))[0];
  if (!line) fail('public key has no payload line');
  const payload = Buffer.from(line, 'base64');
  if (payload.length !== 42) fail(`unexpected public key length ${payload.length}`);
  const algorithm = payload.subarray(0, 2).toString('latin1');
  if (algorithm !== 'Ed') fail(`unexpected public key algorithm '${algorithm}'`);
  return { keyId: parseKeyId(payload), raw: payload.subarray(10) };
}

function parseSignature(signatureFileBase64) {
  const text = Buffer.from(signatureFileBase64.trim(), 'base64').toString('utf8');
  const lines = text.split('\n').map((line) => line.trim());
  if (!lines[0]?.startsWith('untrusted comment:')) fail('signature has no comment line');
  const payload = Buffer.from(lines[1], 'base64');
  if (payload.length !== 74) fail(`unexpected signature length ${payload.length}`);
  const mode = payload.subarray(0, 2).toString('latin1');
  if (mode !== 'Ed' && mode !== 'ED') fail(`unsupported signature mode '${mode}'`);
  return {
    mode,
    keyId: parseKeyId(payload),
    signature: payload.subarray(10),
    trustedComment: lines[2]?.startsWith('trusted comment:') ? lines[2] : null,
  };
}

const artifactPath = readFlag('artifact');
const signaturePath = readFlag('signature');
const pubkeyBase64 = readFlag('pubkey');

const artifact = fs.readFileSync(artifactPath);
const signatureFile = fs.readFileSync(signaturePath, 'utf8');
const publicKey = parsePublicKey(pubkeyBase64);
const signature = parseSignature(signatureFile);

if (publicKey.keyId !== signature.keyId) {
  fail(`key id mismatch: artifact signed by ${signature.keyId}, pinned key ${publicKey.keyId}`);
}

const message =
  signature.mode === 'ED' ? crypto.createHash('blake2b512').update(artifact).digest() : artifact;
const key = crypto.createPublicKey({
  key: Buffer.concat([SPKI_ED25519_PREFIX, publicKey.raw]),
  format: 'der',
  type: 'spki',
});

const ok = crypto.verify(null, message, key, signature.signature);
if (!ok) fail('signature does not match the artifact');

console.log(
  `verified ${artifactPath} (mode ${signature.mode}, keyId ${signature.keyId}, ${artifact.length} bytes)`,
);
