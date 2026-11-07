import { useCallback, useEffect, useMemo, useState } from 'react';
import { VscExtensions, VscGear, VscHome, VscLayout, VscTools } from 'react-icons/vsc';
import { listen } from '@tauri-apps/api/event';
import { appInfo, listPlugins, setLanguage, setTheme } from './api';
import { I18nProvider, translate, type Language, type Translate } from './i18n';
import AppShell, { type AppShellNavItemId } from './legacy/AppShell';
import AboutDialog from './legacy/AboutDialog';
import DashboardPage from './legacy/DashboardPage';
import GlobalSearch from './legacy/GlobalSearch';
import ModulesPage from './legacy/ModulesPage';
import SettingsPage from './legacy/SettingsPage';
import ToolsPage from './legacy/ToolsPage';
import { buildCategories, type Category } from './legacy/data';
import { recordModuleUsage } from './legacy/moduleUsage';
import type { OpenTool } from './legacy/ToolTabs';
import type { AppInfo, InstalledPlugin, Theme } from './types';

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [theme, setThemeState] = useState<Theme>('dark');
  const [language, setLanguageState] = useState<Language>('en');

  const [view, setView] = useState<AppShellNavItemId>('dashboard');
  const [categoryId, setCategoryId] = useState('all');
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [openedTools, setOpenedTools] = useState<OpenTool[]>([]);
  const [toolsFullscreen, setToolsFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const t: Translate = useMemo(() => (key, vars) => translate(language, key, vars), [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    void appInfo()
      .then((next) => {
        setInfo(next);
        setThemeState(next.theme === 'light' ? 'light' : 'dark');
        setLanguageState(next.language === 'zh-CN' ? 'zh-CN' : 'en');
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void listPlugins()
      .then(setPlugins)
      .catch(() => undefined);
  }, []);

  const categories = useMemo(() => buildCategories(t, plugins), [t, plugins]);

  const toolCategories = useMemo<Category[]>(
    () => [
      {
        id: 'all',
        name: t('category.all'),
        icon: <VscLayout />,
        modules: categories.flatMap((category) => category.modules),
      },
      ...categories,
    ],
    [categories, t],
  );

  const searchItems = useMemo(
    () =>
      categories.flatMap((category) =>
        category.modules.map((module) => ({
          module,
          categoryId: category.id,
          categoryName: category.name,
        })),
      ),
    [categories],
  );

  const onTheme = useCallback((next: Theme) => {
    setThemeState(next);
    void setTheme(next).catch(() => undefined);
  }, []);

  const onLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    void setLanguage(next).catch(() => undefined);
  }, []);

  const openTool = useCallback(
    (nextCategoryId: string, moduleId: string) => {
      const module = toolCategories
        .flatMap((category) => category.modules)
        .find((item) => item.id === moduleId);
      if (!module) return;
      setView('tools');
      setCategoryId((prev) => (prev === 'all' ? prev : nextCategoryId));
      setSelectedModuleId(moduleId);
      setOpenedTools((prev) =>
        prev.some((tool) => tool.module.id === moduleId)
          ? prev
          : [...prev, { categoryId: nextCategoryId, module }],
      );
      recordModuleUsage(nextCategoryId, moduleId);
    },
    [toolCategories],
  );

  const closeTool = useCallback((moduleId: string) => {
    setOpenedTools((prev) => {
      const next = prev.filter((tool) => tool.module.id !== moduleId);
      setSelectedModuleId((current) =>
        current === moduleId ? (next[next.length - 1]?.module.id ?? null) : current,
      );
      return next;
    });
  }, []);

  const closeAllTools = useCallback(() => {
    setOpenedTools([]);
    setSelectedModuleId(null);
  }, []);

  // Legacy behaviour: collapse the sidebar while a tool is open.
  useEffect(() => {
    if (view !== 'tools') {
      setToolsFullscreen(false);
      setSidebarCollapsed(false);
    }
  }, [view]);

  useEffect(() => {
    if (view !== 'tools') return;
    const hasToolOpen = Boolean(selectedModuleId) || openedTools.length > 0;
    if (hasToolOpen) {
      setSidebarCollapsed(true);
      return;
    }
    if (!toolsFullscreen) setSidebarCollapsed(false);
  }, [view, openedTools.length, selectedModuleId, toolsFullscreen]);

  // Global search (Cmd/Ctrl+K) and settings (Cmd/Ctrl+,).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setShowSearch((visible) => !visible);
      } else if (event.key === ',') {
        event.preventDefault();
        setView('settings');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Native menu actions emitted by the Tauri host.
  useEffect(() => {
    let disposed = false;
    let unlisteners: Array<() => void> = [];

    const handleAction = (action: string) => {
      switch (action) {
        case 'settings':
          setView('settings');
          break;
        case 'about':
          setShowAbout(true);
          break;
        case 'search':
          setShowSearch(true);
          break;
        case 'dashboard':
          setView('dashboard');
          break;
        case 'tools':
          setView('tools');
          break;
        case 'modules':
          setView('modules');
          break;
        default:
          break;
      }
    };

    void Promise.all([
      listen<string>('menu:action', (event) => handleAction(event.payload)),
      listen<string>('menu:theme', (event) => onTheme(event.payload === 'light' ? 'light' : 'dark')),
      listen<string>('menu:language', (event) => onLanguage(event.payload === 'zh-CN' ? 'zh-CN' : 'en')),
    ]).then((unlisten) => {
      unlisteners = unlisten;
      if (disposed) unlisten.forEach((dispose) => dispose());
    });

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [onLanguage, onTheme]);

  const navItems = useMemo(
    () => [
      { id: 'dashboard' as const, label: t('nav.dashboard'), icon: <VscHome /> },
      { id: 'tools' as const, label: t('nav.tools'), icon: <VscTools /> },
      { id: 'modules' as const, label: t('nav.modules'), icon: <VscExtensions /> },
      { id: 'settings' as const, label: t('nav.settings'), icon: <VscGear /> },
    ],
    [t],
  );

  return (
    <I18nProvider language={language}>
      <AppShell
        navItems={navItems}
        activeNavId={view}
        onNavSelect={(id) => {
          setView(id);
          if (id !== 'tools') setSelectedModuleId(null);
        }}
        categories={toolCategories}
        activeCategoryId={categoryId}
        onCategorySelect={(id) => {
          setView('tools');
          setCategoryId(id);
        }}
        sidebarHidden={view === 'tools' && toolsFullscreen}
        collapsed={sidebarCollapsed}
        onCollapsedChange={setSidebarCollapsed}
      >
        {view === 'dashboard' && (
          <DashboardPage
            categories={categories}
            appInfo={info ? { version: info.version, platform: info.platform, arch: info.arch } : null}
            onOpenTool={openTool}
            onCategorySelect={(id) => {
              setView('tools');
              setCategoryId(id);
            }}
          />
        )}

        {view === 'tools' && (
          <ToolsPage
            categories={toolCategories}
            selectedCategoryId={categoryId}
            selectedModuleId={selectedModuleId}
            openedTools={openedTools}
            onCategorySelect={setCategoryId}
            onOpenTool={openTool}
            onActivateTool={setSelectedModuleId}
            onCloseTool={closeTool}
            onCloseAllTools={closeAllTools}
            plugins={plugins}
            theme={theme}
            isFullscreen={toolsFullscreen}
            onSetFullscreen={setToolsFullscreen}
            onRequestCollapseSidebar={() => setSidebarCollapsed(true)}
          />
        )}

        {view === 'modules' && <ModulesPage onInstalledChange={setPlugins} />}

        {view === 'settings' && (
          <SettingsPage
            appInfo={info}
            theme={theme}
            language={language}
            onTheme={onTheme}
            onLanguage={onLanguage}
          />
        )}
      </AppShell>

      {showSearch && (
        <GlobalSearch items={searchItems} onSelect={openTool} onClose={() => setShowSearch(false)} />
      )}

      <AboutDialog isOpen={showAbout} version={info?.version ?? '—'} onClose={() => setShowAbout(false)} />
    </I18nProvider>
  );
}
