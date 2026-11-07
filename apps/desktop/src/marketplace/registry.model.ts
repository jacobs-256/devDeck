/** Marketplace UI helpers: source trust, public-key validation, catalog filters. */

import type { CatalogEntry, PluginManifest, RegistrySource } from '../types';

export type TrustLevel = 'signature-required' | 'pinned' | 'digest-only';

export function trustLevel(source: RegistrySource): TrustLevel {
  if (source.requireSignature) return 'signature-required';
  if (source.publicKey) return 'pinned';
  return 'digest-only';
}

export const TRUST_LABELS: Record<TrustLevel, string> = {
  'signature-required': 'signature required',
  pinned: 'key pinned',
  'digest-only': 'digest only',
};

export type PublicKeyCheck = { ok: true; value: string | null } | { ok: false; error: string };

/**
 * Validate an Ed25519 public key as Base64 (32 raw bytes). An empty value is
 * allowed and means "digest-only" trust.
 */
export function validatePublicKey(raw: string): PublicKeyCheck {
  const trimmed = raw.trim().replace(/\s+/g, '');
  if (!trimmed) return { ok: true, value: null };

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return { ok: false, error: 'Public key must be standard Base64' };
  }
  if (trimmed.length % 4 !== 0) {
    return { ok: false, error: 'Public key length is not a valid Base64 block' };
  }

  try {
    const decoded = atob(trimmed);
    if (decoded.length !== 32) {
      return { ok: false, error: 'Ed25519 public keys are exactly 32 bytes' };
    }
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, error: 'Public key is not valid Base64' };
  }
}

export function filterCatalog(
  entries: CatalogEntry[],
  query: string,
  category: string | null,
): CatalogEntry[] {
  const needle = query.trim().toLowerCase();
  return entries.filter((entry) => {
    if (category && entry.manifest.categoryId !== category) return false;
    if (!needle) return true;
    const haystack = [
      entry.manifest.id,
      entry.manifest.name,
      entry.manifest.description,
      entry.sourceName,
      ...entry.manifest.keywords,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function catalogCategories(entries: CatalogEntry[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.manifest.categoryId))).sort();
}

export function permissionSummary(manifest: PluginManifest): string[] {
  return [...new Set(manifest.permissions)].sort();
}
