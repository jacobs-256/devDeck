import { describe, expect, it } from 'vitest';
import { jsonToYaml, yamlToJson } from './json-yaml.model';

describe('json <-> yaml', () => {
  it('converts JSON to YAML', () => {
    const result = jsonToYaml('{"name":"DevToolBox","plugins":[{"id":"demo"}],"enabled":true}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain('name: DevToolBox');
    expect(result.value).toContain('- id: demo');
    expect(result.value).toContain('enabled: true');
  });

  it('converts YAML to JSON', () => {
    const result = yamlToJson('name: DevToolBox\ncount: 3\nplugins:\n  - id: demo\n');
    expect(result).toEqual({
      ok: true,
      value:
        '{\n  "name": "DevToolBox",\n  "count": 3,\n  "plugins": [\n    {\n      "id": "demo"\n    }\n  ]\n}',
    });
  });

  it('round-trips nested data', () => {
    const json = '{"a":{"b":[1,2,{"c":"d"}]},"e":null}';
    const yaml = jsonToYaml(json);
    expect(yaml.ok).toBe(true);
    if (!yaml.ok) return;
    const back = yamlToJson(yaml.value);
    expect(back.ok).toBe(true);
    if (back.ok) expect(JSON.parse(back.value)).toEqual(JSON.parse(json));
  });

  it('reports invalid input', () => {
    expect(jsonToYaml('{bad json}').ok).toBe(false);
    expect(yamlToJson('a: [1, 2').ok).toBe(false);
    expect(jsonToYaml('   ')).toEqual({ ok: false, error: 'Input is empty' });
  });

  it('handles empty YAML documents', () => {
    expect(yamlToJson('# only a comment')).toEqual({ ok: true, value: 'null' });
  });
});
