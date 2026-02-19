import { create } from 'zustand';
import type { UserInfo } from '../types';

interface AuthState {
  user: UserInfo | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string, user: UserInfo) => void;
  logout: () => void;
  hasPermission: (resource: string, action: string) => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('sf_token'),
  user: (() => {
    try {
      const stored = localStorage.getItem('sf_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })(),
  isAuthenticated: !!localStorage.getItem('sf_token') && !!localStorage.getItem('sf_user'),

  login: (token: string, user: UserInfo) => {
    localStorage.setItem('sf_token', token);
    localStorage.setItem('sf_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('sf_token');
    localStorage.removeItem('sf_user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  hasPermission: (resource: string, action: string) => {
    const { user } = get();
    if (!user) return false;
    if (user.roles.includes('administrator')) return true;
    return user.permissions.includes(`${resource}:${action}`);
  },

  hasRole: (role: string) => {
    const { user } = get();
    if (!user) return false;
    return user.roles.includes(role);
  },
}));
