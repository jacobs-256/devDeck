import { useEffect, useMemo, useRef, useState } from 'react';
import { sdk } from './sdk';

type Locale = 'en' | 'zh-CN';
type EmojiSize = 'sm' | 'md' | 'lg' | 'xl';

type EmojiData = {
  annotation?: string;
  unicode?: string;
  emoji?: string;
  group?: number;
  subgroup?: number;
  tags?: string[];
  shortcodes?: string[];
  skins?: Array<{
    annotation?: string;
    unicode?: string;
    emoji?: string;
    group?: number;
    subgroup?: number;
    tags?: string[];
    shortcodes?: string[];
  }>;
};

type MessagesData = {
  groups?: Array<{ key: string; message: string; order?: number }>;
  subgroups?: Array<{ key: string; message: string; order?: number }>;
};

type MetaGroupsData = {
  groups?: Record<string, string>;
  subgroups?: Record<string, string>;
};

type EmojiDataset = {
  emojis: EmojiData[];
  groups: Record<string, string>;
  subgroups: Record<string, string>;
};

type CachedDataset = { schemaVersion: 1; updatedAt: number; dataset: EmojiDataset };

type EmojiEntry = {
  id: string;
  unicode: string;
  annotation: string;
  tags: string[];
  shortcodes: string[];
  group?: number;
  subgroup?: number;
};

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[_\s-]+/g, '').trim();
}

function matchAllTerms(haystack: string, q: string): boolean {
  const terms = q
    .split(/\s+/g)
    .map((x) => normalizeText(x))
    .filter(Boolean);
  if (terms.length === 0) return true;
  const h = normalizeText(haystack);
  return terms.every((t) => h.includes(t));
}

function toMessageMap(list: unknown): Record<string, string> {
  if (!Array.isArray(list)) return {};
  const out: Record<string, string> = {};
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const key = (item as { key?: unknown }).key;
    const message = (item as { message?: unknown }).message;
    if (typeof key !== 'string' || typeof message !== 'string') continue;
    out[key] = message;
  }
  return out;
}

function resolveNameByIndex(indexToKey: Record<string, string>, msgByKey: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [idx, key] of Object.entries(indexToKey)) {
    out[idx] = msgByKey[key] ?? key;
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function resolveLocale(raw: unknown): Locale {
  const v = String(raw ?? '').trim();
  if (v === 'en' || v === 'zh-CN') return v;
  const lower = v.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  return 'en';
}

const uiMessages: Record<Locale, Record<string, string>> = {
  en: {
    title: 'Emoji Search',
    subtitle: 'Filter by category, search by tags/name/shortcodes, click to copy',
    allGroups: 'All categories',
    allSubgroups: 'All subcategories',
    searchPlaceholder: 'Search tags / name / shortcodes (fuzzy)',
    loading: 'Loading…',
    shown: 'Shown',
    loadMore: 'Load more',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    sizeSm: 'S',
    sizeMd: 'M',
    sizeLg: 'L',
    sizeXl: 'XL',
  },
  'zh-CN': {
    title: 'Emoji 图标查询',
    subtitle: '按分类筛选，支持标签/名称/短码搜索（空格分词），点击 Emoji 复制',
    allGroups: '全部分类',
    allSubgroups: '全部子分类',
    searchPlaceholder: '搜索标签 / 名称 / shortcodes（支持模糊）',
    loading: '加载中…',
    shown: '已显示',
    loadMore: '加载更多',
    copied: '已复制',
    copyFailed: '复制失败',
    sizeSm: '小',
    sizeMd: '中',
    sizeLg: '大',
    sizeXl: '超大',
  },
};

function t(locale: Locale, key: string): string {
  return uiMessages[locale]?.[key] ?? uiMessages.en[key] ?? key;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-10000px';
      ta.style.top = '-10000px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export default function App() {
  const [locale, setLocale] = useState<Locale>(() => resolveLocale(new URLSearchParams(window.location.search).get('locale') ?? navigator.language));
  const [emojiSize, setEmojiSize] = useState<EmojiSize>('md');
  const [dataset, setDataset] = useState<EmojiDataset | null>(null);
  const [group, setGroup] = useState<string>('all');
  const [subgroup, setSubgroup] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(800);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      const type = (d as { type?: unknown }).type;
      if (type !== 'devtoolbox:locale') return;
      const next = resolveLocale((d as { locale?: unknown }).locale);
      setLocale(next);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await sdk.storage.get<unknown>('emojiSearch.size');
      if (!res.ok) return;
      const v = res.data?.value;
      if (v === 'sm' || v === 'md' || v === 'lg' || v === 'xl') setEmojiSize(v);
    })();
  }, []);

  useEffect(() => {
    void sdk.storage.set('emojiSearch.size', emojiSize);
  }, [emojiSize]);

  useEffect(() => {
    let alive = true;
    void sdk.log.info('app mounted', { locale });
    void (async () => {
      const cacheKey = `emojiSearch.dataset.v1.${locale}`;
      try {
        const cached = await sdk.storage.get<unknown>(cacheKey);
        const cachedValue = cached.ok ? cached.data?.value : undefined;
        if (cached.ok && isRecord(cachedValue)) {
          const c = cachedValue as unknown as CachedDataset;
          const schemaOk = (c as { schemaVersion?: unknown }).schemaVersion === 1;
          const dataOk = isRecord((c as { dataset?: unknown }).dataset);
          if (schemaOk && dataOk && alive) {
            const ds = (c as { dataset: EmojiDataset }).dataset;
            setDataset(ds);
            void sdk.log.info('cache:hit', { updatedAt: (c as { updatedAt?: unknown }).updatedAt, count: ds.emojis.length });
          }
        } else if (cached.ok) {
          void sdk.log.info('cache:miss');
        } else {
          void sdk.log.warn('cache:read_failed', cached.error);
        }
      } catch (e: unknown) {
        void sdk.log.warn('cache:read_error', { error: e instanceof Error ? e.message : String(e) });
      }

      try {
        void sdk.log.info('dataset loading:start');
        const [emojis, messages, meta] =
          locale === 'zh-CN'
            ? await Promise.all([
                import('emojibase-data/zh/compact.json'),
                import('emojibase-data/zh/messages.json'),
                import('emojibase-data/meta/groups.json'),
              ])
            : await Promise.all([
                import('emojibase-data/en/compact.json'),
                import('emojibase-data/en/messages.json'),
                import('emojibase-data/meta/groups.json'),
              ]);
        if (!alive) return;
        const msg = messages.default as unknown as MessagesData;
        const m = meta.default as unknown as MetaGroupsData;
        const groupsByKey = toMessageMap(msg.groups);
        const subgroupsByKey = toMessageMap(msg.subgroups);
        const groupKeys = m.groups ?? {};
        const subgroupKeys = m.subgroups ?? {};
        const nextDataset: EmojiDataset = {
          emojis: emojis.default as unknown as EmojiData[],
          groups: resolveNameByIndex(groupKeys, groupsByKey),
          subgroups: resolveNameByIndex(subgroupKeys, subgroupsByKey),
        };
        setDataset(nextDataset);
        void sdk.log.info('dataset loading:ok', { count: (emojis.default as unknown as EmojiData[]).length });
        void sdk.storage.set(cacheKey, { schemaVersion: 1, updatedAt: Date.now(), dataset: nextDataset }).then((r) => {
          if (r.ok) void sdk.log.info('cache:updated');
          else void sdk.log.warn('cache:update_failed', r.error);
        });
      } catch (e: unknown) {
        void sdk.log.error('dataset loading:error', { error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [locale]);

  useEffect(() => {
    setGroup('all');
    setSubgroup('all');
    setQuery('');
  }, [locale]);

  const emojiEntries = useMemo<EmojiEntry[]>(() => {
    const list = dataset?.emojis ?? [];
    const out: EmojiEntry[] = [];
    for (const e of list) {
      const baseUnicode = e.unicode ?? e.emoji;
      if (typeof baseUnicode === 'string' && baseUnicode) {
        out.push({
          id: baseUnicode,
          unicode: baseUnicode,
          annotation: String(e.annotation ?? ''),
          tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
          shortcodes: Array.isArray(e.shortcodes) ? e.shortcodes.map(String) : [],
          group: typeof e.group === 'number' ? e.group : undefined,
          subgroup: typeof e.subgroup === 'number' ? e.subgroup : undefined,
        });
      }
      if (Array.isArray(e.skins)) {
        for (const s of e.skins) {
          const u = s.unicode ?? s.emoji;
          if (typeof u !== 'string' || !u) continue;
          out.push({
            id: `${baseUnicode ?? ''}_${u}`,
            unicode: u,
            annotation: String(s.annotation ?? e.annotation ?? ''),
            tags: Array.isArray(s.tags) ? s.tags.map(String) : Array.isArray(e.tags) ? e.tags.map(String) : [],
            shortcodes: Array.isArray(s.shortcodes) ? s.shortcodes.map(String) : Array.isArray(e.shortcodes) ? e.shortcodes.map(String) : [],
            group: typeof s.group === 'number' ? s.group : typeof e.group === 'number' ? e.group : undefined,
            subgroup: typeof s.subgroup === 'number' ? s.subgroup : typeof e.subgroup === 'number' ? e.subgroup : undefined,
          });
        }
      }
    }
    return out;
  }, [dataset?.emojis]);

  const groupOptions = useMemo(() => {
    const uniq = new Set<number>();
    for (const e of emojiEntries) {
      if (typeof e.group === 'number') uniq.add(e.group);
    }
    return Array.from(uniq)
      .sort((a, b) => a - b)
      .map((id) => ({ id: String(id), name: dataset?.groups[String(id)] ?? `Group ${id}` }));
  }, [dataset?.groups, emojiEntries]);

  const subgroupOptions = useMemo(() => {
    const uniq = new Set<number>();
    for (const e of emojiEntries) {
      if (group !== 'all' && String(e.group ?? '') !== group) continue;
      if (typeof e.subgroup === 'number') uniq.add(e.subgroup);
    }
    return Array.from(uniq)
      .sort((a, b) => a - b)
      .map((id) => ({ id: String(id), name: dataset?.subgroups[String(id)] ?? `Subgroup ${id}` }));
  }, [dataset?.subgroups, emojiEntries, group]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const byGroup = emojiEntries.filter((e) => {
      if (group !== 'all' && String(e.group ?? '') !== group) return false;
      if (subgroup !== 'all' && String(e.subgroup ?? '') !== subgroup) return false;
      if (!q) return true;
      const haystack = [e.annotation, ...e.tags, ...e.shortcodes].join(' ');
      return matchAllTerms(haystack, q);
    });
    return byGroup;
  }, [emojiEntries, group, subgroup, query]);

  const shown = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  useEffect(() => {
    setLimit(800);
    loadingMoreRef.current = false;
  }, [group, subgroup, query]);

  useEffect(() => {
    loadingMoreRef.current = false;
  }, [limit]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!dataset) return;
      if (shown.length >= filtered.length) return;
      if (loadingMoreRef.current) return;
      const remain = el.scrollHeight - (el.scrollTop + el.clientHeight);
      if (remain > 240) return;
      loadingMoreRef.current = true;
      setLimit((n) => n + 800);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [dataset, filtered.length, shown.length]);

  useEffect(() => {
    const el = gridWrapRef.current;
    if (!el) return;
    if (!dataset) return;
    if (shown.length >= filtered.length) return;
    const remain = el.scrollHeight - (el.scrollTop + el.clientHeight);
    if (remain > 240) return;
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLimit((n) => n + 800);
  }, [dataset, filtered.length, shown.length]);

  async function handleCopy(unicode: string) {
    const ok = await copyText(unicode);
    const msg = ok ? `${t(locale, 'copied')}：${unicode}` : t(locale, 'copyFailed');
    setToast(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 1200);
  }

  const sizeStyle = useMemo(() => {
    const map: Record<EmojiSize, { cell: number; font: number }> = {
      sm: { cell: 40, font: 18 },
      md: { cell: 46, font: 22 },
      lg: { cell: 56, font: 28 },
      xl: { cell: 72, font: 36 },
    };
    const v = map[emojiSize];
    return { ['--emoji-cell' as string]: `${v.cell}px`, ['--emoji-font' as string]: `${v.font}px` } as React.CSSProperties;
  }, [emojiSize]);

  return (
    <div className="app" style={sizeStyle}>
      <div className="header">
        <div>
          <div className="title">{t(locale, 'title')}</div>
          <div className="sub">{t(locale, 'subtitle')}</div>
        </div>
      </div>

      <div className="filters" style={!dataset ? { opacity: 0.6, pointerEvents: 'none' } : undefined}>
        <select
          value={group}
          onChange={(e) => {
            setGroup(e.target.value);
            setSubgroup('all');
          }}
        >
          <option value="all">{t(locale, 'allGroups')}</option>
          {groupOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <select value={subgroup} onChange={(e) => setSubgroup(e.target.value)}>
          <option value="all">{t(locale, 'allSubgroups')}</option>
          {subgroupOptions.map((sg) => (
            <option key={sg.id} value={sg.id}>
              {sg.name}
            </option>
          ))}
        </select>

        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t(locale, 'searchPlaceholder')} />
      </div>

      <div className="gridWrap" ref={gridWrapRef}>
        <div className="grid">
          {!dataset ? (
            <div style={{ padding: 12, color: 'var(--text-tertiary)', fontSize: 12 }}>{t(locale, 'loading')}</div>
          ) : (
            shown.map((e) => (
              <button
                key={e.id}
                type="button"
                className="emojiBtn"
                title={[e.annotation, ...e.tags.slice(0, 6)].filter(Boolean).join(' · ')}
                onClick={() => void handleCopy(e.unicode)}
              >
                {e.unicode}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="footer">
        <span>
          {t(locale, 'shown')} {shown.length}/{filtered.length}
        </span>
        <div className="sizeSwitch">
          {(['sm', 'md', 'lg', 'xl'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="sizeBtn"
              data-active={emojiSize === s ? '1' : '0'}
              onClick={() => setEmojiSize(s)}
            >
              {t(locale, s === 'sm' ? 'sizeSm' : s === 'md' ? 'sizeMd' : s === 'lg' ? 'sizeLg' : 'sizeXl')}
            </button>
          ))}
        </div>
      </div>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}
