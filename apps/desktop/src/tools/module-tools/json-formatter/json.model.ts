/** JSON formatting, minification, and structural summary. */

export type JsonResult = { ok: true; value: string } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

function parse(input: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (input.trim() === '') return { ok: false, error: 'Input is empty' };
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch (error) {
    return fail(error);
  }
}

export function formatJson(input: string, indent = 2): JsonResult {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value, null, indent) };
}

export function minifyJson(input: string): JsonResult {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(parsed.value) };
}

export function sortKeysJson(input: string, indent = 2): JsonResult {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;
  return { ok: true, value: JSON.stringify(sortValue(parsed.value), null, indent) };
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}

/** Human-readable shape of the root value, e.g. "object with 3 keys". */
export function summarizeJson(input: string): JsonResult {
  const parsed = parse(input);
  if (!parsed.ok) return parsed;

  const value = parsed.value;
  if (value === null) return { ok: true, value: 'null' };
  if (Array.isArray(value)) return { ok: true, value: `array with ${value.length} item(s)` };

  switch (typeof value) {
    case 'object': {
      const keys = Object.keys(value as Record<string, unknown>);
      const preview = keys.slice(0, 8).join(', ');
      const suffix = keys.length > 8 ? ', …' : '';
      return {
        ok: true,
        value: `object with ${keys.length} key(s)${keys.length ? `: ${preview}${suffix}` : ''}`,
      };
    }
    case 'string':
      return { ok: true, value: `string (${value.length} character(s))` };
    case 'number':
    case 'boolean':
      return { ok: true, value: `${typeof value}: ${String(value)}` };
    default:
      return { ok: true, value: typeof value };
  }
}
