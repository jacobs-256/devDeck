import { describe, expect, it } from 'vitest';
import {
  catalogCategories,
  filterCatalog,
  permissionSummary,
  trustLevel,
  validatePublicKey,
} from './registry.model';
import type { CatalogEntry, PluginManifest, RegistrySource } from '../types';

function source(overrides: Partial<RegistrySource> = {}): RegistrySource {
  return {
    id: 'example-com',
    name: 'Example',
    url: 'https://example.com/registry.json',
    requireSignature: false,
    addedAtMs: 1,
    ...overrides,
  };
}

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'market-demo',
    name: 'Demo',
    description: 'A demo plugin',
    version: '1.0.0',
    sdkVersion: '2.0',
    entry: 'package/index.html',
    categoryId: 'text-tools',
    author: 'Test',
    license: 'MIT',
    keywords: [],
    permissions: ['storage:kv'],
    httpDomains: [],
    envAllowlist: [],
    ...overrides,
  };
}

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    sourceId: 'example-com',
    sourceName: 'Example',
    manifest: manifest(),
    downloadUrl: 'https://example.com/demo.zip',
    sha256: 'a'.repeat(64),
    size: 1,
    publishedAt: '',
    status: 'active',
    signed: false,
    ...overrides,
  };
}

describe('registry trust', () => {
  it('derives trust levels from the source configuration', () => {
    expect(trustLevel(source())).toBe('digest-only');
    expect(trustLevel(source({ publicKey: 'key' }))).toBe('pinned');
    expect(trustLevel(source({ publicKey: 'key', requireSignature: true }))).toBe('signature-required');
  });

  it('accepts empty and valid 32-byte public keys', () => {
    expect(validatePublicKey('')).toEqual({ ok: true, value: null });
    const key = btoa(String.fromCharCode(...new Uint8Array(32)));
    expect(validatePublicKey(key)).toEqual({ ok: true, value: key });
    // Whitespace/newlines from pasted PEM-ish content are tolerated.
    expect(validatePublicKey(`  ${key.slice(0, 20)}\n${key.slice(20)} `).ok).toBe(true);
  });

  it('rejects malformed public keys', () => {
    expect(validatePublicKey('not base64!').ok).toBe(false);
    expect(validatePublicKey(btoa('short')).ok).toBe(false);
    expect(validatePublicKey('QUJD').ok).toBe(false);
    expect(validatePublicKey('aaaa').ok).toBe(false);
  });
});

describe('catalog filtering', () => {
  const entries = [
    entry(),
    entry({
      manifest: manifest({ id: 'market-ip', name: 'IP Lookup', categoryId: 'network', keywords: ['geo'] }),
      sourceName: 'Other',
    }),
    entry({ manifest: manifest({ id: 'market-json', name: 'JSON Tools', description: 'format json' }) }),
  ];

  it('filters by text across id, name, description, source, and keywords', () => {
    expect(filterCatalog(entries, 'ip', null).map((item) => item.manifest.id)).toEqual(['market-ip']);
    expect(filterCatalog(entries, 'geo', null)).toHaveLength(1);
    expect(filterCatalog(entries, 'other', null)).toHaveLength(1);
    expect(filterCatalog(entries, 'json', null)).toHaveLength(1);
    expect(filterCatalog(entries, '', null)).toHaveLength(3);
  });

  it('filters by category', () => {
    expect(filterCatalog(entries, '', 'network').map((item) => item.manifest.id)).toEqual(['market-ip']);
    expect(filterCatalog(entries, '', 'missing')).toHaveLength(0);
  });

  it('lists categories', () => {
    expect(catalogCategories(entries)).toEqual(['network', 'text-tools']);
  });

  it('dedupes and sorts permissions', () => {
    expect(permissionSummary(manifest({ permissions: ['storage:kv', 'log:write', 'storage:kv'] }))).toEqual([
      'log:write',
      'storage:kv',
    ]);
  });
});
