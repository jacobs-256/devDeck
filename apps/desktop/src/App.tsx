import { useCallback, useEffect, useMemo, useState } from 'react';
import { VscExtensions, VscGear, VscHome, VscLayout, VscTools } from 'react-icons/vsc';
import { listen } from '@tauri-apps/api/event';
import {
  DEFAULT_REGISTRY_URL,
  addSource,
  appInfo,
  removeSource,
  listPlugins,
  listSources,
  setLanguage,
  setTextSize,
  setTheme,
} from './api';
import { I18nProvider, translate, type Language, type Translate } from './i18n';
import { I18nProvider as LegacyI18nProvider } from './legacy-renderer/i18n';
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
import type { AppInfo, InstalledPlugin, LanguageSetting, TextSize, Theme, ThemeSetting } from './types';

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [themeSetting, setThemeSetting] = useState<ThemeSetting>('auto');
  const [languageSetting, setLanguageSetting] = useState<LanguageSetting>('auto');
  const [textSize, setTextSizeState] = useState<TextSize>('default');
  const [systemTheme, setSystemTheme] = useState<Theme>(() =>
    window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
  );
  const [systemLanguage, setSystemLanguage] = useState<Language>(() =>
    navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en',
  );

  const theme: Theme = themeSetting === 'auto' ? systemTheme : themeSetting;
  const language: Language = languageSetting === 'auto' ? systemLanguage : languageSetting;

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
    const sync = () => setSystemLanguage(navigator.language?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en');
    window.addEventListener('languagechange', sync);
    return () => window.removeEventListener('languagechange', sync);
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: light)');
    if (!media) return;
    const onChange = () => setSystemTheme(media.matches ? 'light' : 'dark');
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const scales: Record<TextSize, number> = { small: 0.9, default: 1, large: 1.1, xlarge: 1.2 };
    const root = document.getElementById('root');
    if (!root) return;
    const scale = scales[textSize];
    root.style.zoom = String(scale);
    root.style.width = scale === 1 ? '' : `calc(100% / ${scale})`;
    root.style.height = scale === 1 ? '' : `calc(100% / ${scale})`;
  }, [textSize]);

  useEffect(() => {
    void appInfo()
      .then((next) => {
        setInfo(next);
        setThemeSetting(next.theme === 'auto' || next.theme === 'light' ? next.theme : 'dark');
        setLanguageSetting(next.language === 'auto' || next.language === 'zh-CN' ? next.language : 'en');
        setTextSizeState(next.textSize);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void listPlugins()
      .then(setPlugins)
      .catch(() => undefined);
  }, []);

  // Ensure the official registry is present on every launch. Older builds set
  // a one-shot flag even when the registry URL had moved, leaving the release
  // UI with no way to add it back (release builds hide custom registries).
  useEffect(() => {
    void (async () => {
      try {
        const sources = await listSources();
        const legacyOfficialUrls = [
          'https://github.com/XthingsJacobs/devToolBox/releases/download/marketplace/registry.json',
          'https://github.com/jacobs-256/devToolBox/releases/download/marketplace/registry.json',
          'https://github.com/XthingsJacobs/devDeck/releases/download/marketplace/registry.json',
        ];
        for (const source of sources) {
          if (legacyOfficialUrls.includes(source.url) && source.url !== DEFAULT_REGISTRY_URL) {
            await removeSource(source.id);
          }
        }
        if (!sources.some((source) => source.url === DEFAULT_REGISTRY_URL)) {
          await addSource(DEFAULT_REGISTRY_URL, { name: 'DevDeck Marketplace' });
        }
        window.localStorage.removeItem('devdeck.defaultRegistrySeeded');
        window.dispatchEvent(new Event('devdeck:registry-updated'));
      } catch {
        // Offline or validation failure: retry on the next launch.
      }
    })();
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

  const onTheme = useCallback((next: ThemeSetting) => {
    setThemeSetting(next);
    void setTheme(next).catch(() => undefined);
  }, []);

  const onLanguage = useCallback((next: LanguageSetting) => {
    setLanguageSetting(next);
    void setLanguage(next).catch(() => undefined);
  }, []);

  const onTextSize = useCallback((next: TextSize) => {
    setTextSizeState(next);
    void setTextSize(next).catch(() => undefined);
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
      <LegacyI18nProvider initialLocale={language}>
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
            <LegacyI18nProvider initialLocale={language}>
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
            </LegacyI18nProvider>
          )}

          {view === 'modules' && <ModulesPage onInstalledChange={setPlugins} />}

          {view === 'settings' && (
            <SettingsPage
              appInfo={info}
              themeSetting={themeSetting}
              languageSetting={languageSetting}
              textSize={textSize}
              onTheme={onTheme}
              onLanguage={onLanguage}
              onTextSize={onTextSize}
            />
          )}
        </AppShell>

        {showSearch && (
          <GlobalSearch items={searchItems} onSelect={openTool} onClose={() => setShowSearch(false)} />
        )}

        <AboutDialog isOpen={showAbout} version={info?.version ?? '—'} onClose={() => setShowAbout(false)} />
      </LegacyI18nProvider>
    </I18nProvider>
  );
}
