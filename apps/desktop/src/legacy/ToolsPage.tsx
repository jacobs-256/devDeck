import { Suspense, useEffect, useMemo } from 'react';
import { VscScreenFull, VscScreenNormal } from 'react-icons/vsc';
import styles from './ToolsPage.module.css';
import { categoryColor, type Category, type LegacyModule } from './data';
import { TOOLS } from '../tools/registry';
import { PluginView } from '../components/PluginView';
import ToolListPanel from './ToolListPanel';
import ToolTabs, { type OpenTool } from './ToolTabs';
import type { InstalledPlugin, Theme } from '../types';

const TOOL_COMPONENTS = new Map(TOOLS.map((tool) => [tool.id, tool.component]));

export default function ToolsPage({
  categories,
  selectedCategoryId,
  selectedModuleId,
  openedTools,
  onCategorySelect,
  onOpenTool,
  onActivateTool,
  onCloseTool,
  onCloseAllTools,
  plugins,
  theme,
  isFullscreen,
  onSetFullscreen,
  onRequestCollapseSidebar,
}: {
  categories: Category[];
  selectedCategoryId: string;
  selectedModuleId: string | null;
  openedTools: OpenTool[];
  onCategorySelect: (categoryId: string) => void;
  onOpenTool: (categoryId: string, moduleId: string) => void;
  onActivateTool: (moduleId: string) => void;
  onCloseTool: (moduleId: string) => void;
  onCloseAllTools?: () => void;
  plugins: InstalledPlugin[];
  theme: Theme;
  isFullscreen: boolean;
  onSetFullscreen: (v: boolean) => void;
  onRequestCollapseSidebar?: () => void;
}) {
  const pluginById = useMemo(() => new Map(plugins.map((p) => [p.manifest.id, p])), [plugins]);

  const selectedModule: LegacyModule | null = useMemo(() => {
    if (!selectedModuleId) return null;
    for (const c of categories) {
      const m = c.modules.find((x) => x.id === selectedModuleId);
      if (m) return m;
    }
    return null;
  }, [categories, selectedModuleId]);

  const activeCategory = useMemo(() => {
    if (!selectedModule) return null;
    return categories.find((c) => c.id === selectedModule.categoryId) ?? null;
  }, [categories, selectedModule]);

  const activeColor = selectedModule ? categoryColor(selectedModule.categoryId) : 'var(--accent-secondary)';

  // Esc leaves fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSetFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, onSetFullscreen]);

  // Cmd/Ctrl+W closes the active tool, like the legacy app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() !== 'w') return;
      if (!selectedModuleId) return;
      e.preventDefault();
      onCloseTool(selectedModuleId);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCloseTool, selectedModuleId]);

  return (
    <div
      className={styles.page}
      style={
        isFullscreen
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              width: '100vw',
              height: '100vh',
              background: 'var(--bg-primary)',
            }
          : undefined
      }
    >
      {!isFullscreen && (
        <ToolListPanel
          categories={categories}
          activeCategoryId={selectedCategoryId}
          activeToolId={selectedModuleId}
          onSelectTool={(categoryId, toolId) => {
            onRequestCollapseSidebar?.();
            if (selectedCategoryId !== 'all') onCategorySelect(categoryId);
            onOpenTool(categoryId, toolId);
          }}
        />
      )}

      <div className={styles.workspace}>
        <div className={`${styles.inner}${isFullscreen ? ` ${styles.innerFullscreen}` : ''}`}>
          {openedTools.length > 0 && (
            <ToolTabs
              categories={categories}
              opened={openedTools}
              activeToolId={selectedModuleId}
              onActivate={onActivateTool}
              onClose={onCloseTool}
              onCloseAll={onCloseAllTools}
            />
          )}

          {selectedModule && (
            <div className={styles.toolHeader}>
              <div
                className={styles.toolHeaderIcon}
                style={{
                  background: `${activeColor}12`,
                  borderColor: `${activeColor}28`,
                  color: activeColor,
                }}
              >
                {selectedModule.icon}
              </div>
              <div className={styles.toolHeaderMeta}>
                <div className={styles.toolHeaderTitle}>{selectedModule.name}</div>
                <span
                  className={styles.toolHeaderPill}
                  style={{
                    background: `${activeColor}15`,
                    borderColor: `${activeColor}28`,
                    color: activeColor,
                  }}
                >
                  {activeCategory?.name ?? selectedModule.categoryId}
                </span>
              </div>
              <div className={styles.toolHeaderSpacer} />
              <button
                type="button"
                className={styles.toolHeaderBtn}
                data-active={isFullscreen ? '1' : '0'}
                onClick={() => onSetFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? <VscScreenNormal /> : <VscScreenFull />}
              </button>
            </div>
          )}

          <div className={styles.content}>
            {openedTools.length === 0 && (
              <div className={styles.empty}>
                <div className={styles.emptyTitle}>Select a tool from the panel</div>
                <div className={styles.emptySubtitle}>Choose from available developer utilities</div>
              </div>
            )}

            {openedTools.map(({ module }) => {
              const isActive = selectedModuleId === module.id;
              const Builtin = TOOL_COMPONENTS.get(module.id);
              const plugin = pluginById.get(module.id);

              return (
                <div
                  key={module.id}
                  className={styles.keepAlive}
                  style={{ display: isActive ? undefined : 'none' }}
                >
                  {Builtin ? (
                    <Suspense fallback={<div className={styles.empty}>Loading…</div>}>
                      <Builtin />
                    </Suspense>
                  ) : plugin ? (
                    <PluginView plugin={plugin} theme={theme} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
