import { describe, expect, it } from 'vitest';
import { jsonToXml, xmlToJson } from './json-xml.model';

describe('json <-> xml', () => {
  it('converts JSON to XML with attributes', () => {
    const result = jsonToXml('{"catalog":{"@_version":"1","book":{"title":"A"}}}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain('<catalog version="1">');
    expect(result.value).toContain('<title>A</title>');
  });

  it('converts XML to JSON with attributes', () => {
    const result = xmlToJson('<catalog version="1"><book id="b1">Title</book></catalog>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.value) as Record<string, Record<string, unknown>>;
    expect(parsed['catalog']?.['@_version']).toBe('1');
    expect(parsed['catalog']?.['book']).toEqual({ '@_id': 'b1', '#text': 'Title' });
  });

  it('parses numbers and booleans', () => {
    const result = xmlToJson('<r><n>42</n><b>true</b></r>');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.value)).toEqual({ r: { n: 42, b: true } });
    }
  });

  it('reports malformed XML with a position', () => {
    const result = xmlToJson('<a><b></a>');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/line \d+/);
  });

  it('rejects empty and invalid JSON input', () => {
    expect(jsonToXml('')).toEqual({ ok: false, error: 'Input is empty' });
    expect(jsonToXml('{nope}').ok).toBe(false);
    expect(xmlToJson('   ')).toEqual({ ok: false, error: 'Input is empty' });
  });
});
