/** JavaScript formatting and minification. */

import beautify from 'js-beautify';

export type JsResult = { ok: true; value: string } | { ok: false; error: string };

function fail(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function formatJs(code: string, indent = 2): JsResult {
  if (!code.trim()) return { ok: false, error: 'Input is empty' };
  try {
    return {
      ok: true,
      value: beautify.js(code, {
        indent_size: Math.max(1, Math.min(8, indent)),
        preserve_newlines: true,
        max_preserve_newlines: 2,
        space_in_empty_paren: false,
        end_with_newline: true,
      }),
    };
  } catch (error) {
    return fail(error);
  }
}

export async function minifyJs(code: string): Promise<JsResult> {
  if (!code.trim()) return { ok: false, error: 'Input is empty' };
  try {
    // Terser is ~600 kB; load it only when the user actually minifies.
    const { minify } = await import('terser');
    const result = await minify(code, { compress: true, mangle: true });
    if (typeof result.code !== 'string') {
      return { ok: false, error: 'Minifier produced no output' };
    }
    return { ok: true, value: result.code };
  } catch (error) {
    return fail(error);
  }
}
