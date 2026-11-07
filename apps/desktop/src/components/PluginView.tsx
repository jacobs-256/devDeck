import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { pluginEntryUrl } from '../api';
import { dispatchSdkRequest, EVENT_MESSAGE, SDK_REQUEST, THEME_MESSAGE } from '../pluginBridge';
import type { InstalledPlugin, Theme } from '../types';

interface PluginViewProps {
  plugin: InstalledPlugin;
  theme: Theme;
  className?: string;
  onError?: (message: string | null) => void;
}

/**
 * Runs one installed plugin in a sandboxed iframe.
 *
 * `allow-scripts` without `allow-same-origin` gives the frame an opaque origin,
 * so plugin code can never reach into the host document even though it is
 * served from a DevToolBox-owned scheme.
 */
export function PluginView({ plugin, theme, className, onError }: PluginViewProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const src = pluginEntryUrl(plugin, theme);

  useEffect(() => {
    onError?.(lastError);
  }, [lastError, onError]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data as { type?: unknown } | null;
      if (!data || data.type !== SDK_REQUEST) return;

      void dispatchSdkRequest(plugin.manifest.id, data).then((response) => {
        if (!response) return;
        frame.contentWindow?.postMessage(response, '*');
        setLastError(response.ok ? null : `${response.error.code}: ${response.error.message}`);
      });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [plugin.manifest.id]);

  // Forward host-pushed events (socket data, SSH terminal output) to the plugin.
  useEffect(() => {
    let dispose: Array<() => void> = [];
    let cancelled = false;
    const channels = [
      { event: 'plugin-socket', name: 'socket' },
      { event: 'plugin-ssh', name: 'ssh' },
    ] as const;

    void Promise.all(
      channels.map((channel) =>
        listen<{ pluginId: string }>(channel.event, (event) => {
          const payload = event.payload;
          if (!payload || payload.pluginId !== plugin.manifest.id) return;
          frameRef.current?.contentWindow?.postMessage(
            { type: EVENT_MESSAGE, event: channel.name, payload },
            '*',
          );
        }),
      ),
    ).then((unlisteners) => {
      if (cancelled) unlisteners.forEach((unlisten) => unlisten());
      else dispose = unlisteners;
    });

    return () => {
      cancelled = true;
      dispose.forEach((unlisten) => unlisten());
    };
  }, [plugin.manifest.id]);

  useEffect(() => {
    // Re-send on load as well: the plugin may not be listening yet on mount.
    const sendTheme = () => {
      frameRef.current?.contentWindow?.postMessage({ type: THEME_MESSAGE, theme }, '*');
    };
    sendTheme();
    const frame = frameRef.current;
    frame?.addEventListener('load', sendTheme);
    return () => frame?.removeEventListener('load', sendTheme);
  }, [theme, src]);

  return (
    <iframe
      ref={frameRef}
      title={plugin.manifest.name}
      src={src}
      className={className ?? 'plugin-frame'}
      sandbox="allow-scripts allow-forms allow-popups"
    />
  );
}
