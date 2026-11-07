#!/usr/bin/env node
/**
 * Ed25519 signing and verification for Marketplace artifacts.
 *
 * The signature format matches `crates/devtoolbox-market/src/signing.rs`:
 *   - Ed25519
 *   - public key: 32 raw bytes, standard Base64
 *   - signature:  64 raw bytes, standard Base64
 *   - keyId:      first 16 hex chars of sha256(public key bytes)
 *
 * Usage:
 *   node scripts/sign.mjs keygen [--out signing-key.txt]
 *   node scripts/sign.mjs sign <file> [--key <file|base64>]
 *   node scripts/sign.mjs verify <file> <signature.json> --pubkey <file|base64>
 *
 * The key file holds the Base64 Ed25519 seed (32 bytes). Keep it out of git.
 * Verification is authoritative in the Rust crate; this CLI exists so plugin
 * authors can produce artifacts locally and in CI.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function readKeySource(value) {
  if (!value) {
    const fromEnv = process.env.DEVTOOLBOX_SIGNING_KEY?.trim();
    if (fromEnv) return fromEnv;
    fail('missing key: set DEVTOOLBOX_SIGNING_KEY or pass --key <file|base64>');
  }
  if (fs.existsSync(value)) return fs.readFileSync(value, 'utf8').trim();
  return value.trim();
}

function privateKeyFromSeedBase64(seedBase64) {
  const seed = Buffer.from(seedBase64, 'base64');
  if (seed.length !== 32) {
    fail('signing key must decode to exactly 32 bytes (Ed25519 seed)');
  }
  return crypto.createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

function publicKeyBase64(privateKey) {
  const spki = crypto.createPublicKey(privateKey).export({ format: 'der', type: 'spki' });
  return spki.subarray(spki.length - 32).toString('base64');
}

function keyIdOf(publicKeyB64) {
  return crypto.createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('hex').slice(0, 16);
}

function parseArgs(argv) {
  const positional = [];
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=');
      if (inline !== undefined) {
        flags.set(name, inline);
      } else {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('--')) {
          flags.set(name, true);
        } else {
          flags.set(name, value);
          i += 1;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function commandKeygen(flags) {
  const out = typeof flags.get('out') === 'string' ? flags.get('out') : 'signing-key.txt';
  const seed = crypto.randomBytes(32);
  const privateKey = privateKeyFromSeedBase64(seed.toString('base64'));
  const publicKey = publicKeyBase64(privateKey);
  const keyId = keyIdOf(publicKey);

  if (fs.existsSync(out) && !flags.has('force')) {
    fail(`refusing to overwrite ${out} (pass --force)`);
  }
  fs.writeFileSync(out, `${seed.toString('base64')}\n`, { mode: 0o600 });
  console.log(`signing key written: ${path.resolve(out)}`);
  console.log(`public key (Base64): ${publicKey}`);
  console.log(`keyId: ${keyId}`);
  console.log('');
  console.log('Publish the public key in your registry config; keep the seed secret.');
}

function commandSign(positional, flags) {
  const [file] = positional;
  if (!file) fail('usage: sign <file> [--key <file|base64>]');
  if (!fs.existsSync(file)) fail(`no such file: ${file}`);

  const privateKey = privateKeyFromSeedBase64(readKeySource(flags.get('key')));
  const publicKey = publicKeyBase64(privateKey);
  const data = fs.readFileSync(file);
  const signature = crypto.sign(null, data, privateKey);

  const envelope = {
    algorithm: 'ed25519',
    keyId: keyIdOf(publicKey),
    publicKey,
    signature: signature.toString('base64'),
  };
  const out = `${file}.sig`;
  fs.writeFileSync(out, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  console.log(`signed ${file}`);
  console.log(`  keyId:     ${envelope.keyId}`);
  console.log(`  signature: ${out}`);
}

function commandPublicKey(flags) {
  const seed = readKeySource(flags.get('key'));
  console.log(publicKeyBase64(privateKeyFromSeedBase64(seed)));
}

function commandVerify(positional, flags) {
  const [file, sigFile] = positional;
  if (!file || !sigFile) fail('usage: verify <file> <signature.json> --pubkey <file|base64>');
  const publicKeyB64 = readKeySource(flags.get('pubkey'));
  const envelope = JSON.parse(fs.readFileSync(sigFile, 'utf8'));
  const spki = Buffer.concat([SPKI_PREFIX, Buffer.from(publicKeyB64, 'base64')]);
  const publicKey = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
  const ok = crypto.verify(
    null,
    fs.readFileSync(file),
    publicKey,
    Buffer.from(String(envelope.signature ?? ''), 'base64'),
  );
  if (!ok) fail(`signature does not match ${file}`);
  console.log(`verified ${file} (keyId ${envelope.keyId ?? 'unknown'})`);
}

const argv = process.argv.slice(2);
const KNOWN = new Set(['keygen', 'sign', 'verify', 'public-key']);
const command = KNOWN.has(argv[0]) ? argv.shift() : 'sign';
const { positional, flags } = parseArgs(argv);

switch (command) {
  case 'keygen':
    commandKeygen(flags);
    break;
  case 'sign':
    commandSign(positional, flags);
    break;
  case 'verify':
    commandVerify(positional, flags);
    break;
  case 'public-key':
    commandPublicKey(flags);
    break;
  default:
    fail('usage: sign.mjs [keygen|sign|verify|public-key] ...');
}
