/** Thin typed wrappers around the Tauri command surface. */

import { invoke } from '@tauri-apps/api/core';
import type {
  AppInfo,
  Catalog,
  DesktopSettings,
  InstalledPlugin,
  LanguageSetting,
  RegistrySource,
  ServiceStatus,
  TextSize,
  ThemeSetting,
} from './types';

export const DEFAULT_REGISTRY_URL =
  'https://github.com/jacobs-256/devDeck/releases/download/marketplace/registry.json';

export function appInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('app_info');
}

export function listPlugins(): Promise<InstalledPlugin[]> {
  return invoke<InstalledPlugin[]>('plugin_list');
}

export function uninstallPlugin(pluginId: string): Promise<void> {
  return invoke<void>('plugin_uninstall', { pluginId });
}

export function setPluginEnabled(pluginId: string, enabled: boolean): Promise<InstalledPlugin> {
  return invoke<InstalledPlugin>('plugin_set_enabled', { pluginId, enabled });
}

export function setTheme(theme: ThemeSetting): Promise<void> {
  return invoke<void>('theme_set', { theme });
}

export function setLanguage(language: LanguageSetting): Promise<void> {
  return invoke<void>('language_set', { language });
}

export function setTextSize(size: TextSize): Promise<void> {
  return invoke<void>('text_size_set', { size });
}

export function desktopSettings(): Promise<DesktopSettings> {
  return invoke<DesktopSettings>('desktop_settings_get');
}

export function saveDesktopSettings(settings: DesktopSettings): Promise<DesktopSettings> {
  return invoke<DesktopSettings>('desktop_settings_set', { settings });
}

export function checkServicePort(port: number): Promise<boolean> {
  return invoke<boolean>('service_check', { port });
}

export function serviceStatus(): Promise<ServiceStatus> {
  return invoke<ServiceStatus>('service_status');
}

/**
 * Build the custom-protocol URL Tauri serves for an installed plugin.
 *
 * macOS/Linux use `plugin://localhost/…`; WebView2 on Windows maps custom
 * schemes to `http://plugin.localhost/…`.
 */
export function pluginEntryUrl(plugin: InstalledPlugin, theme: ThemeSetting): string {
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

/** Normalize Tauri's `{ code, message }` rejections and JS errors for display. */
export function formatError(reason: unknown): string {
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return reason.message;
  if (reason && typeof reason === 'object') {
    const value = reason as { code?: unknown; message?: unknown };
    if (typeof value.message === 'string') {
      return typeof value.code === 'string' && value.code
        ? `${value.message} (${value.code})`
        : value.message;
    }
    try {
      return JSON.stringify(reason);
    } catch {
      return String(reason);
    }
  }
  return String(reason);
}
