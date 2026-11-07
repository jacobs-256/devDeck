import { describe, expect, it } from 'vitest';
import { formatJs, minifyJs } from './js.model';

describe('js formatter', () => {
  it('pretty-prints code', () => {
    const result = formatJs('const a={b:1,c:[1,2]}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain('const a = {');
    expect(result.value).toContain('b: 1');
    expect(result.value).toContain('\n');
  });

  it('honours the indent size', () => {
    const two = formatJs('function f(){return 1}', 2);
    const four = formatJs('function f(){return 1}', 4);
    expect(two.ok && four.ok).toBe(true);
    if (two.ok && four.ok) {
      expect(four.value).not.toBe(two.value);
      expect(four.value).toContain('    return 1');
    }
  });

  it('rejects empty input', () => {
    expect(formatJs('   ')).toEqual({ ok: false, error: 'Input is empty' });
  });

  it('minifies code', async () => {
    const source = 'function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));\n';
    const result = await minifyJs(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThan(source.length);
    expect(result.value).not.toContain('\n');
  });

  it('reports minifier syntax errors', async () => {
    const result = await minifyJs('function {{');
    expect(result.ok).toBe(false);
  });

  it('rejects empty input when minifying', async () => {
    expect(await minifyJs('')).toEqual({ ok: false, error: 'Input is empty' });
  });
});
