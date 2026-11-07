/** JSON ↔ XML conversion and validation. */

import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';

export type ConvertResult = { ok: true; value: string } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function jsonToXml(input: string): ConvertResult {
  if (!input.trim()) return { ok: false, error: 'Input is empty' };
  try {
    const parsed = JSON.parse(input) as unknown;
    const builder = new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      format: true,
      indentBy: '  ',
      suppressEmptyNode: true,
    });
    return { ok: true, value: builder.build(parsed) };
  } catch (error) {
    return fail(error);
  }
}

export function xmlToJson(input: string, indent = 2): ConvertResult {
  if (!input.trim()) return { ok: false, error: 'Input is empty' };

  const validation = XMLValidator.validate(input);
  if (validation !== true) {
    const { msg, line, col } = validation.err;
    return { ok: false, error: `${msg} (line ${line}, column ${col})` };
  }

  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
      trimValues: true,
    });
    return { ok: true, value: JSON.stringify(parser.parse(input), null, indent) };
  } catch (error) {
    return fail(error);
  }
}
