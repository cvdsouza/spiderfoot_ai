import { create } from 'zustand';

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  isDark: localStorage.getItem('sf_theme') === 'dark',
  toggle: () =>
    set((state) => {
      const newDark = !state.isDark;
      localStorage.setItem('sf_theme', newDark ? 'dark' : 'light');
      document.documentElement.classList.toggle('dark', newDark);
      return { isDark: newDark };
    }),
}));

// Initialize on load
if (localStorage.getItem('sf_theme') === 'dark') {
  document.documentElement.classList.add('dark');
}
