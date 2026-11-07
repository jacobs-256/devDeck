/** Semantic version comparison for the Marketplace UI. */

function versionTuple(value: string): [number, number, number] {
  const parts = value.split(/[.+-]/).slice(0, 3);
  const read = (index: number): number => {
    const parsed = Number.parseInt(parts[index] ?? '0', 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return [read(0), read(1), read(2)];
}

/** Returns a negative/zero/positive number like `a - b`. */
export function compareVersions(a: string, b: string): number {
  const left = versionTuple(a);
  const right = versionTuple(b);
  for (let index = 0; index < 3; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}
