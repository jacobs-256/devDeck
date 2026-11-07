/** Regular-expression testing with bounded match collection. */

export interface RegexMatch {
  index: number;
  match: string;
  groups: string[];
  namedGroups: Record<string, string>;
}

export type RegexResult =
  | { ok: true; matches: RegexMatch[]; truncated: boolean }
  | { ok: false; error: string };

const ALLOWED_FLAGS = new Set(['g', 'i', 'm', 's', 'u', 'y']);

/** Keep only supported flags, dedupe, and always enable global matching. */
export function normalizeFlags(input: string): string {
  const seen = new Set<string>();
  let flags = '';
  for (const character of input) {
    if (!ALLOWED_FLAGS.has(character) || seen.has(character)) continue;
    seen.add(character);
    flags += character;
  }
  if (!seen.has('g')) flags += 'g';
  return flags;
}

export function runRegex(pattern: string, flags: string, input: string, limit = 500): RegexResult {
  if (pattern === '') return { ok: true, matches: [], truncated: false };

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, normalizeFlags(flags));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  const matches: RegexMatch[] = [];
  let truncated = false;
  const safeLimit = Math.max(1, limit);

  while (matches.length < safeLimit) {
    const match = regex.exec(input);
    if (!match) break;

    const namedGroups: Record<string, string> = {};
    for (const [name, value] of Object.entries(match.groups ?? {})) {
      if (typeof value === 'string') namedGroups[name] = value;
    }

    matches.push({
      index: match.index,
      match: match[0],
      groups: match.slice(1).map((group) => group ?? ''),
      namedGroups,
    });

    // Zero-length matches would loop forever without advancing lastIndex.
    if (match[0] === '') regex.lastIndex += 1;
    if (regex.lastIndex > input.length) break;
  }

  if (matches.length === safeLimit && regex.exec(input)) truncated = true;

  return { ok: true, matches, truncated };
}

/** Apply a replacement using the same pattern/flags. */
export function replaceAll(
  pattern: string,
  flags: string,
  input: string,
  replacement: string,
): { ok: true; value: string } | { ok: false; error: string } {
  try {
    const regex = new RegExp(pattern, normalizeFlags(flags));
    return { ok: true, value: input.replace(regex, replacement) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
