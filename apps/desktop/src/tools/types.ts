import type { ComponentType, LazyExoticComponent } from 'react';
import type { MessageKey } from '../i18n';

/** Groups tools in the sidebar. Keep this list stable: it is user-visible. */
export type ToolCategory = 'encoding' | 'crypto' | 'network' | 'text' | 'data';

export interface ToolDefinition {
  /** Stable id, kebab-case. Used in URLs/state and tests. */
  id: string;
  name: string;
  description: string;
  /** i18n keys; `name`/`description` remain the English search index. */
  nameKey: MessageKey;
  descriptionKey: MessageKey;
  category: ToolCategory;
  /** Extra search terms (synonyms, abbreviations). */
  keywords: string[];
  component: ComponentType | LazyExoticComponent<ComponentType>;
}

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  encoding: 'Encoding',
  crypto: 'Crypto & Tokens',
  network: 'Network',
  text: 'Text',
  data: 'Data',
};

export const CATEGORY_ORDER: ToolCategory[] = ['encoding', 'crypto', 'network', 'text', 'data'];
