/** JSON ↔ YAML conversion. */

import yaml from 'js-yaml';

export type ConvertResult = { ok: true; value: string } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function jsonToYaml(input: string): ConvertResult {
  if (!input.trim()) return { ok: false, error: 'Input is empty' };
  try {
    const parsed = JSON.parse(input) as unknown;
    return {
      ok: true,
      value: yaml.dump(parsed, { indent: 2, lineWidth: -1, noRefs: true }),
    };
  } catch (error) {
    return fail(error);
  }
}

export function yamlToJson(input: string, indent = 2): ConvertResult {
  if (!input.trim()) return { ok: false, error: 'Input is empty' };
  try {
    const parsed = yaml.load(input);
    return { ok: true, value: JSON.stringify(parsed ?? null, null, indent) };
  } catch (error) {
    return fail(error);
  }
}
