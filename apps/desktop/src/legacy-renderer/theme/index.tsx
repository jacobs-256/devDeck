/** Minimal theme hook for legacy tool components. The host owns theme state. */
export type Theme = 'dark' | 'light';

export function useTheme(): { theme: Theme; setting: Theme; setThemeSetting: () => void } {
  const theme: Theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  return { theme, setting: theme, setThemeSetting: () => undefined };
}
