import type { ReactNode } from 'react';
import {
  VscBroadcast,
  VscCode,
  VscDiff,
  VscExtensions,
  VscFile,
  VscGlobe,
  VscJson,
  VscKey,
  VscLink,
  VscLock,
  VscMarkdown,
  VscRegex,
  VscSymbolNumeric,
  VscSymbolString,
  VscTerminal,
} from 'react-icons/vsc';
import { TOOLS } from '../tools/registry';
import type { MessageKey, Translate } from '../i18n';
import type { InstalledPlugin } from '../types';

export type CategoryId =
  | 'all'
  | 'dev-tools'
  | 'text-tools'
  | 'network-tools'
  | 'security-tools'
  | 'other-tools';

export interface LegacyModule {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  icon?: ReactNode;
}

export interface Category {
  id: CategoryId;
  name: string;
  icon?: ReactNode;
  modules: LegacyModule[];
}

const TOOL_CATEGORY: Record<string, Exclude<CategoryId, 'all'>> = {
  data: 'dev-tools',
  encoding: 'text-tools',
  text: 'text-tools',
  crypto: 'security-tools',
  network: 'network-tools',
};

const TOOL_ICONS: Record<string, ReactNode> = {
  base64: <VscCode />,
  'url-codec': <VscLink />,
  'json-formatter': <VscJson />,
  'json-yaml': <VscJson />,
  'json-xml': <VscJson />,
  unicode: <VscSymbolString />,
  pinyin: <VscSymbolString />,
  'qr-code': <VscSymbolNumeric />,
  'wifi-qr': <VscGlobe />,
  jwt: <VscKey />,
  uuid: <VscSymbolNumeric />,
  'regex-tester': <VscRegex />,
  'ip-calculator': <VscGlobe />,
  'markdown-preview': <VscMarkdown />,
  'text-diff': <VscDiff />,
  'key-pair': <VscKey />,
  'ca-generator': <VscLock />,
  'csr-generator': <VscFile />,
  'client-cert': <VscFile />,
  'cert-viewer': <VscFile />,
  'html-editor': <VscCode />,
  'js-formatter': <VscCode />,
  'string-encrypt': <VscLock />,
  'tcp-ping': <VscTerminal />,
  'websocket-tester': <VscTerminal />,
  mqtt: <VscBroadcast />,
  tracert: <VscGlobe />,
};

const CATEGORY_DEFS: Array<{ id: Exclude<CategoryId, 'all'>; key: MessageKey; icon: ReactNode }> = [
  { id: 'dev-tools', key: 'category.dev', icon: <VscCode /> },
  { id: 'text-tools', key: 'category.text', icon: <VscSymbolString /> },
  { id: 'network-tools', key: 'category.network', icon: <VscGlobe /> },
  { id: 'security-tools', key: 'category.security', icon: <VscLock /> },
  { id: 'other-tools', key: 'category.other', icon: <VscExtensions /> },
];

/** Built-in tools plus enabled marketplace plugins, grouped like the legacy UI. */
export function buildCategories(t: Translate, plugins: InstalledPlugin[]): Category[] {
  const byCategory = new Map<string, LegacyModule[]>();

  for (const tool of TOOLS) {
    const categoryId = TOOL_CATEGORY[tool.category] ?? 'other-tools';
    const list = byCategory.get(categoryId) ?? [];
    list.push({
      id: tool.id,
      name: t(tool.nameKey),
      description: t(tool.descriptionKey),
      categoryId,
      icon: TOOL_ICONS[tool.id] ?? <VscCode />,
    });
    byCategory.set(categoryId, list);
  }

  for (const plugin of plugins) {
    if (!plugin.enabled) continue;
    const categoryId = plugin.manifest.categoryId;
    const list = byCategory.get(categoryId) ?? [];
    list.push({
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      description: plugin.manifest.description,
      categoryId,
      icon: <VscExtensions />,
    });
    byCategory.set(categoryId, list);
  }

  const categories: Category[] = CATEGORY_DEFS.map((def) => ({
    id: def.id,
    name: t(def.key),
    icon: def.icon,
    modules: byCategory.get(def.id) ?? [],
  })).filter((category) => category.modules.length > 0);

  // Plugins may declare a category outside the built-in set.
  for (const [categoryId, modules] of byCategory) {
    if (CATEGORY_DEFS.some((def) => def.id === categoryId)) continue;
    categories.push({
      id: categoryId as CategoryId,
      name: categoryId,
      icon: <VscExtensions />,
      modules,
    });
  }

  return categories;
}

export function categoryColor(categoryId: string): string {
  switch (categoryId) {
    case 'dev-tools':
      return 'var(--cat-dev)';
    case 'text-tools':
      return 'var(--cat-text)';
    case 'network-tools':
      return 'var(--cat-network)';
    case 'security-tools':
      return 'var(--cat-security)';
    case 'other-tools':
      return 'var(--cat-other)';
    default:
      return 'var(--accent-secondary)';
  }
}
