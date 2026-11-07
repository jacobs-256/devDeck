import { describe, expect, it } from 'vitest';
import { buildQuery, decodeComponent, encodeComponent, parseQuery } from './url.model';

describe('url codec', () => {
  it('encodes and decodes components', () => {
    const encoded = encodeComponent('a b&c=d/你');
    expect(encoded).toBe('a%20b%26c%3Dd%2F%E4%BD%A0');
    expect(decodeComponent(encoded)).toEqual({ ok: true, value: 'a b&c=d/你' });
  });

  it('reports malformed escapes instead of throwing', () => {
    expect(decodeComponent('%E0%A4%A').ok).toBe(false);
  });

  it('parses a query string with repeated keys and plus signs', () => {
    expect(parseQuery('?a=1&a=2&b=hello+world&c=')).toEqual([
      { key: 'a', value: '1' },
      { key: 'a', value: '2' },
      { key: 'b', value: 'hello world' },
      { key: 'c', value: '' },
    ]);
  });

  it('handles a bare query without a leading question mark', () => {
    expect(parseQuery('x=%E4%BD%A0')).toEqual([{ key: 'x', value: '你' }]);
  });

  it('builds a query string and skips empty keys', () => {
    expect(
      buildQuery([
        { key: 'a', value: '1 2' },
        { key: '', value: 'ignored' },
      ]),
    ).toBe('a=1%202');
  });
});
