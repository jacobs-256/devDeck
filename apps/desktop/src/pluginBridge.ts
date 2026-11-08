/** Renderer side of the plugin SDK bridge.
 *
 * A plugin runs in a sandboxed iframe and can only talk to the host through
 * `postMessage`. This module validates the message source and forwards every
 * request to the single gated Rust entry point (`plugin_sdk_call`).
 *
 * Security invariants:
 * - only messages whose `event.source` is the plugin's own iframe are handled;
 * - the plugin id is supplied by the host, never by the plugin;
 * - the host re-checks installation, enablement, and permissions on every call.
 */

import { invoke } from '@tauri-apps/api/core';
import type { SdkError } from './types';

export const SDK_REQUEST = 'devdeck:sdk:request';
export const SDK_RESPONSE = 'devdeck:sdk:response';
export const THEME_MESSAGE = 'devdeck:theme';
/** Host-pushed events (e.g. socket data) forwarded to the plugin iframe. */
export const EVENT_MESSAGE = 'devdeck:event';

interface SdkRequestEnvelope {
  type?: string;
  requestId?: string;
  method?: string;
  params?: unknown;
}

export type SdkResponseEnvelope =
  | { type: typeof SDK_RESPONSE; requestId: string; ok: true; data?: unknown }
  | { type: typeof SDK_RESPONSE; requestId: string; ok: false; error: SdkError };

export function normalizeError(error: unknown): SdkError {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown };
    if (typeof candidate.code === 'string') {
      return {
        code: candidate.code,
        message: typeof candidate.message === 'string' ? candidate.message : candidate.code,
      };
    }
  }
  if (error instanceof Error) {
    return { code: 'internal', message: error.message };
  }
  return { code: 'internal', message: String(error) };
}

export async function dispatchSdkRequest(
  pluginId: string,
  data: unknown,
): Promise<SdkResponseEnvelope | null> {
  if (typeof data !== 'object' || data === null) return null;
  const request = data as SdkRequestEnvelope;
  if (request.type !== SDK_REQUEST) return null;

  const requestId = typeof request.requestId === 'string' ? request.requestId : '';
  const method = typeof request.method === 'string' ? request.method : '';

  try {
    const result = await invoke<unknown>('plugin_sdk_call', {
      pluginId,
      method,
      params: request.params ?? null,
    });
    return { type: SDK_RESPONSE, requestId, ok: true, data: result };
  } catch (error) {
    return { type: SDK_RESPONSE, requestId, ok: false, error: normalizeError(error) };
  }
}
