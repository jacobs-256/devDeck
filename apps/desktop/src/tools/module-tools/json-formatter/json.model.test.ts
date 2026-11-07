import { describe, expect, it } from 'vitest';
import { formatJson, minifyJson, sortKeysJson, summarizeJson } from './json.model';

describe('json formatter', () => {
  it('pretty-prints with two spaces', () => {
    expect(formatJson('{"b":1,"a":[1,2]}')).toEqual({
      ok: true,
      value: '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}',
    });
  });

  it('minifies', () => {
    expect(minifyJson('{ "a" : 1 , "b" : [ 1, 2 ] }')).toEqual({ ok: true, value: '{"a":1,"b":[1,2]}' });
  });

  it('sorts keys recursively', () => {
    const result = sortKeysJson('{"b":{"z":1,"a":2},"a":3}');
    expect(result).toEqual({ ok: true, value: '{\n  "a": 3,\n  "b": {\n    "a": 2,\n    "z": 1\n  }\n}' });
  });

  it('reports parse errors with a position', () => {
    const result = formatJson('{ "a": }');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/position|JSON/i);
  });

  it('rejects empty input', () => {
    expect(formatJson('   ')).toEqual({ ok: false, error: 'Input is empty' });
  });

  it('summarizes the root value', () => {
    expect(summarizeJson('[1,2,3]')).toEqual({ ok: true, value: 'array with 3 item(s)' });
    expect(summarizeJson('{"a":1,"b":2}')).toEqual({
      ok: true,
      value: 'object with 2 key(s): a, b',
    });
    expect(summarizeJson('"hi"')).toEqual({ ok: true, value: 'string (2 character(s))' });
  });
});
