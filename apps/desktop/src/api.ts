/** Thin typed wrappers around the Tauri command surface. */

import { invoke } from '@tauri-apps/api/core';
import type { Language } from './i18n';
import type {
  AppInfo,
  CachedRegistryInfo,
  Catalog,
  Diagnostics,
  GrantSummary,
  InstalledPlugin,
  RegistryReport,
  RegistrySource,
  Theme,
} from './types';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function appInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('app_info');
}

export function listPlugins(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>('plugin_list');
}

export function installFromBytes(
  bytes: Uint8Array,
  expectedSha256: string | null = null,
  allowDowngrade = false,
): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('plugin_install_zip', {
    bytes: Array.from(bytes),
    expectedSha256,
    allowDowngrade,
  });
}

export function installFromFolder(path: string): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('plugin_install_folder', { path });
}

export function installFromPath(path: string): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('plugin_install_file', { path });
}

export function uninstallPlugin(pluginId: string): Promise<void> {
  return invoke<void>('plugin_uninstall', { pluginId });
}

export function setPluginEnabled(pluginId: string, enabled: boolean): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('plugin_set_enabled', { pluginId, enabled });
}

export function pluginCapabilities(pluginId: string): Promise<GrantSummary | null> {
  return invoke<GrantSummary | null>('plugin_capabilities', { pluginId });
}

export function validateRegistry(bytes: Uint8Array): Promise<RegistryReport> {
  return invoke<RegistryReport>('registry_validate', { bytes: Array.from(bytes) });
}

export function setTheme(theme: Theme): Promise<void> {
  return invoke<void>('theme_set', { theme });
}

export function setLanguage(language: Language): Promise<void> {
  return invoke<void>('language_set', { language });
}

export function diagnostics(): Promise<Diagnostics> {
  return invoke<Diagnostics>('diagnostics');
}

/**
 * Build the custom-protocol URL Tauri serves for an installed plugin.
 *
 * macOS/Linux use `plugin://localhost/…`; WebView2 on Windows maps custom
 * schemes to `http://plugin.localhost/…`.
 */
export function pluginEntryUrl(plugin: InstalledPlugin, theme: Theme): string {
  const { id, entry } = plugin.manifest;
  const origin = /Windows/i.test(navigator.userAgent) ? 'http://plugin.localhost' : 'plugin://localhost';
  return `${origin}/${id}/${entry}?theme=${theme}`;
}

export function listSources(): Promise<RegistrySource[]> {
  return invoke<RegistrySource[]>('registry_list_sources');
}

export function addSource(
  url: string,
  options: { name?: string; publicKey?: string; requireSignature?: boolean } = {},
): Promise<RegistrySource> {
  return invoke<RegistrySource>('registry_add_source', {
    url,
    name: options.name ?? null,
    publicKey: options.publicKey ?? null,
    requireSignature: options.requireSignature ?? false,
  });
}

export function removeSource(sourceId: string): Promise<void> {
  return invoke<void>('registry_remove_source', { sourceId });
}

export function refreshCatalog(sourceId: string | null = null): Promise<Catalog> {
  return invoke<Catalog>('registry_refresh', { sourceId });
}

export function installFromRegistry(
  sourceId: string,
  pluginId: string,
  version: string | null = null,
): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('plugin_install_from_registry', {
    sourceId,
    pluginId,
    version,
  });
}

export function cacheStatus(): Promise<CachedRegistryInfo[]> {
  return invoke<CachedRegistryInfo[]>('registry_cache_status');
}
