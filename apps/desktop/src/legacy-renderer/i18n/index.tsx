// @ts-nocheck
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { Locale } from './types';
import enCommon from './locales/en/common';
import zhCNCommon from './locales/zh-CN/common';

/**
 * Auto-scan module locales under ModuleTools:
 *   ../components/ModuleTools/{Name}/locales/en.ts
 */
const moduleLocaleFiles = import.meta.glob<{ default: Record<string, string> }>(
  ['../components/ModuleTools/*/locales/*.ts'],
  { eager: true },
);

/** Aggregate module translations by locale from glob results */
function buildModuleMessages(): Record<Locale, Record<string, Record<string, string>>> {
  const result: Record<Locale, Record<string, Record<string, string>>> = { en: {}, 'zh-CN': {} };
  for (const [filePath, mod] of Object.entries(moduleLocaleFiles)) {
    // Example path: ../components/ModuleTools/Base64Codec/locales/en.ts
    const parts = filePath.split('/');
    const locale = parts[parts.length - 1].replace('.ts', '') as Locale;
    const folderName = parts[parts.length - 3]; // e.g. "Base64Codec"
    if ((locale === 'en' || locale === 'zh-CN') && folderName) result[locale][folderName] = mod.default;
  }
  return result;
}

const moduleMessages = buildModuleMessages();

type MessageTree = Record<string, unknown>;

const messages: Record<Locale, MessageTree> = {
  en: enCommon as MessageTree,
  'zh-CN': zhCNCommon as MessageTree,
};

type LocaleSetting = 'auto' | Locale;

const LOCALE_SETTING_KEY = 'devtoolbox_locale_setting';

function resolveSystemLocale(): Locale {
  const raw = String(navigator.language ?? '').toLowerCase();
  if (raw.startsWith('zh')) return 'zh-CN';
  return 'en';
}

function resolveLocale(setting: LocaleSetting): Locale {
  if (setting === 'auto') return resolveSystemLocale();
  return setting;
}

function getDefaultSetting(): LocaleSetting {
  const raw = localStorage.getItem(LOCALE_SETTING_KEY) || '';
  if (raw === 'auto' || raw === 'en' || raw === 'zh-CN') return raw;
  localStorage.setItem(LOCALE_SETTING_KEY, 'auto');
  return 'auto';
}

/** Read nested values by dot-path */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getByPath(obj: unknown, path: string): string {
  const keys = path.split('.');
  let cur: unknown = obj;
  for (const k of keys) {
    if (!isRecord(cur)) return path;
    cur = cur[k];
  }
  return typeof cur === 'string' ? cur : path;
}

interface I18nContextValue {
  locale: Locale;
  setting: LocaleSetting;
  setLocale: (l: LocaleSetting) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  setting: 'auto',
  setLocale: () => {},
  t: (k) => k,
});

export function I18nProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [setting, setSetting] = useState<LocaleSetting>(initialLocale ?? getDefaultSetting());
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? resolveLocale(setting));

  useEffect(() => {
    if (initialLocale) {
      setSetting(initialLocale);
      setLocaleState(initialLocale);
    }
  }, [initialLocale]);

  const setLocale = useCallback((next: LocaleSetting) => {
    setSetting(next);
    localStorage.setItem(LOCALE_SETTING_KEY, next);
    setLocaleState(resolveLocale(next));
    void window.electronAPI?.setLocale(next);
  }, []);

  const t = useCallback(
    (key: string): string => {
      const primary = messages[locale] ?? messages.en;
      const out = getByPath(primary, key);
      if (out !== key) return out;
      if (locale === 'en') return out;
      return getByPath(messages.en, key);
    },
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setting, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Find module locale data by folder name, e.g. "Base64Codec".
 */
export function getModuleLocale(locale: Locale, folderName: string): Record<string, string> | undefined {
  return moduleMessages[locale]?.[folderName] ?? moduleMessages.en?.[folderName];
}

/** Get localized category name */
export function getCategoryName(locale: Locale, categoryId: string): string {
  const node = (messages[locale] ?? messages.en)['categories'];
  if (!isRecord(node)) return categoryId;
  const v = node[categoryId];
  if (typeof v === 'string') return v;
  if (locale === 'en') return categoryId;
  const fallback = (messages.en['categories'] as Record<string, unknown> | undefined)?.[categoryId];
  return typeof fallback === 'string' ? fallback : categoryId;
}
