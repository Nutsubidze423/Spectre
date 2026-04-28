import { create } from 'zustand';
import type { AuthUser, AppView } from '../types';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  appView: AppView;

  setSession: (user: AuthUser, accessToken: string) => void;
  logout: () => void;
  setAppView: (view: AppView) => void;
  tryRestoreSession: () => Promise<void>;
}

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001';

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  appView: 'loading',

  setSession: (user, accessToken) => set({ user, accessToken, appView: 'boards' }),

  logout: () => {
    void fetch(`${SERVER_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    set({ user: null, accessToken: null, appView: 'auth' });
  },

  setAppView: (view) => set({ appView: view }),

  tryRestoreSession: async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        set({ appView: 'auth' });
        return;
      }
      const data = (await res.json()) as { accessToken: string; user: AuthUser };
      set({ user: data.user, accessToken: data.accessToken, appView: 'boards' });
    } catch {
      set({ appView: 'auth' });
    }
  },
}));
