import { create } from 'zustand';

// Dark-only mode — always apply .dark class
document.documentElement.classList.add('dark');

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
}

// Always dark — toggle is a no-op kept for backward compatibility
export const useThemeStore = create<ThemeState>(() => ({
  isDark: true,
  toggle: () => {},
}));
