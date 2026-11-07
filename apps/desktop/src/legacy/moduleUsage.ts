export type ModuleUsageEntry = {
  categoryId: string;
  moduleId: string;
  count: number;
  lastUsed: number;
};

const STORAGE_KEY = 'devtools.moduleUsage.v1';
const EVENT_NAME = 'devtools:module-usage-updated';

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function loadModuleUsage(): ModuleUsageEntry[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeParse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x): x is Record<string, unknown> => isRecord(x))
    .map((x) => {
      const categoryId = typeof x.categoryId === 'string' ? x.categoryId : '';
      const moduleId = typeof x.moduleId === 'string' ? x.moduleId : '';
      const count = typeof x.count === 'number' ? x.count : Number(x.count ?? 0) || 0;
      const lastUsed = typeof x.lastUsed === 'number' ? x.lastUsed : Number(x.lastUsed ?? 0) || 0;
      return { categoryId, moduleId, count, lastUsed };
    })
    .filter((x) => x.categoryId.length > 0 && x.moduleId.length > 0);
}

export function recordModuleUsage(categoryId: string, moduleId: string) {
  const now = Date.now();
  const list = loadModuleUsage();
  const idx = list.findIndex((x) => x.categoryId === categoryId && x.moduleId === moduleId);
  if (idx >= 0) {
    const item = list[idx];
    if (!item) return;
    list[idx] = { ...item, count: item.count + 1, lastUsed: now };
  } else {
    list.unshift({ categoryId, moduleId, count: 1, lastUsed: now });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, 200)));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeModuleUsageUpdated(cb: () => void) {
  window.addEventListener(EVENT_NAME, cb);
  return () => window.removeEventListener(EVENT_NAME, cb);
}

export function scoreUsage(item: ModuleUsageEntry) {
  const days = (Date.now() - item.lastUsed) / 86400000;
  const recent = Math.max(0, 14 - days);
  return item.count * 2 + recent;
}
