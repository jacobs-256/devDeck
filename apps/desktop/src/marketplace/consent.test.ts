import { describe, expect, it } from 'vitest';
import { buildConsent } from './consent';
import type { CatalogEntry, InstalledPlugin, PluginManifest } from '../types';

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'market-demo',
    name: 'Demo',
    description: 'demo',
    version: '2.0.0',
    sdkVersion: '2.0',
    entry: 'package/index.html',
    categoryId: 'tools',
    author: { name: 'Ada' },
    license: 'MIT',
    homepage: 'https://example.com',
    repository: 'https://github.com/example/demo',
    keywords: [],
    permissions: ['log:write', 'net:socket', 'storage:kv'],
    httpDomains: ['b.example.com', 'a.example.com'],
    envAllowlist: ['HOME'],
    ...overrides,
  };
}

function entry(overrides: Partial<PluginManifest> = {}): CatalogEntry {
  return {
    sourceId: 'example-com',
    sourceName: 'Example',
    manifest: manifest(overrides),
    downloadUrl: 'https://example.com/demo.zip',
    sha256: 'a'.repeat(64),
    size: 1,
    publishedAt: '',
    status: 'active',
    signed: false,
  };
}

function installed(version: string): InstalledPlugin {
  return {
    manifest: manifest({ version }),
    enabled: true,
    installedAtMs: 1,
    source: { kind: 'registry', value: 'example-com' },
  };
}

describe('buildConsent', () => {
  it('collects identity and permissions, most privileged first', () => {
    const details = buildConsent(entry());
    expect(details.name).toBe('Demo');
    expect(details.author).toBe('Ada');
    expect(details.license).toBe('MIT');
    expect(details.permissions.map((permission) => permission.id)).toEqual([
      'net:socket',
      'log:write',
      'storage:kv',
    ]);
    expect(details.sensitive.map((permission) => permission.id)).toEqual(['net:socket']);
    expect(details.httpDomains).toEqual(['a.example.com', 'b.example.com']);
    expect(details.envAllowlist).toEqual(['HOME']);
    expect(details.isUpdate).toBe(false);
  });

  it('flags updates when the catalog version is newer', () => {
    expect(buildConsent(entry({ version: '2.0.0' }), installed('1.0.0')).isUpdate).toBe(true);
    expect(buildConsent(entry({ version: '1.0.0' }), installed('1.0.0')).isUpdate).toBe(false);
    expect(buildConsent(entry({ version: '1.0.0' }), installed('2.0.0')).isUpdate).toBe(false);
  });

  it('reports the installed version for updates', () => {
    const details = buildConsent(entry({ version: '2.0.0' }), installed('1.4.0'));
    expect(details.installedVersion).toBe('1.4.0');
  });

  it('handles string authors', () => {
    expect(buildConsent(entry({ author: 'Team' })).author).toBe('Team');
  });
});
