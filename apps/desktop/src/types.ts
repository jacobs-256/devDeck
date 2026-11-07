/** Types mirrored from `crates/devtoolbox-contract` and the host commands. */

export type PluginPermission = string;

export interface PluginAuthorDetails {
  name: string;
  url?: string;
  email?: string;
}

export type PluginAuthor = string | PluginAuthorDetails;

export interface PluginManifest {
  schemaVersion?: number;
  id: string;
  name: string;
  description: string;
  version: string;
  sdkVersion: string;
  entry: string;
  categoryId: string;
  author: PluginAuthor;
  license: string;
  homepage?: string;
  repository?: string;
  icon?: string;
  keywords: string[];
  permissions: PluginPermission[];
  httpDomains: string[];
  envAllowlist: string[];
  minAppVersion?: string;
}

export type InstallSource =
  | { kind: 'registry'; value: string }
  | { kind: 'localFile'; value: string }
  | { kind: 'development' };

export interface InstalledPlugin {
  manifest: PluginManifest;
  enabled: boolean;
  installedAtMs: number;
  source: InstallSource;
}

import type { Language } from './i18n';

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  dataDir: string;
  theme: Theme;
  language: Language;
}

export interface SdkError {
  code: string;
  message: string;
  details?: unknown;
}

export type Theme = 'light' | 'dark';

export interface RegistrySource {
  id: string;
  name: string;
  url: string;
  publicKey?: string;
  requireSignature: boolean;
  addedAtMs: number;
}

export interface CatalogEntry {
  sourceId: string;
  sourceName: string;
  manifest: PluginManifest;
  downloadUrl: string;
  sha256: string;
  size: number;
  publishedAt: string;
  status: 'active' | 'deprecated' | 'yanked' | 'unknown';
  signed: boolean;
}

export interface SourceError {
  sourceId: string;
  sourceName: string;
  message: string;
}

export interface Catalog {
  entries: CatalogEntry[];
  errors: SourceError[];
}
