import { useState } from 'react';
import type { InstalledPlugin, Theme } from '../types';
import { PluginView } from './PluginView';

interface PluginFrameProps {
  plugin: InstalledPlugin;
  theme: Theme;
  onClose: () => void;
}

/** Fullscreen plugin overlay (used for standalone plugin windows). */
export function PluginFrame({ plugin, theme, onClose }: PluginFrameProps) {
  const [lastError, setLastError] = useState<string | null>(null);

  return (
    <div className="plugin-overlay" role="dialog" aria-modal="true">
      <header className="plugin-header">
        <div>
          <strong>{plugin.manifest.name}</strong>
          <span className="muted"> {plugin.manifest.version}</span>
        </div>
        <div className="plugin-header-actions">
          {lastError ? (
            <span className="sdk-error" title={lastError}>
              {lastError.length > 60 ? `${lastError.slice(0, 60)}…` : lastError}
            </span>
          ) : null}
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </header>
      <PluginView plugin={plugin} theme={theme} onError={setLastError} />
    </div>
  );
}
