/** Text diffing built on the `diff` package. */

import { createTwoFilesPatch, diffChars, diffLines, diffWords } from 'diff';

export type DiffMode = 'lines' | 'words' | 'chars';

export interface DiffRow {
  type: 'added' | 'removed' | 'unchanged';
  text: string;
  /** Number of lines/words/chars covered by this chunk (as reported by `diff`). */
  count: number;
}

export interface DiffStats {
  added: number;
  removed: number;
  unchanged: number;
}

export function diffText(before: string, after: string, mode: DiffMode): DiffRow[] {
  const changes =
    mode === 'words'
      ? diffWords(before, after)
      : mode === 'chars'
        ? diffChars(before, after)
        : diffLines(before, after);

  return changes.map((change) => ({
    type: change.added ? 'added' : change.removed ? 'removed' : 'unchanged',
    text: change.value,
    count: change.count ?? 0,
  }));
}

export function diffStats(rows: DiffRow[]): DiffStats {
  return rows.reduce<DiffStats>(
    (stats, row) => {
      if (row.type === 'added') stats.added += row.count || 1;
      else if (row.type === 'removed') stats.removed += row.count || 1;
      else stats.unchanged += row.count || 1;
      return stats;
    },
    { added: 0, removed: 0, unchanged: 0 },
  );
}

export function unifiedPatch(
  before: string,
  after: string,
  beforeName = 'before',
  afterName = 'after',
): string {
  return createTwoFilesPatch(beforeName, afterName, before, after, '', '', { context: 3 });
}
