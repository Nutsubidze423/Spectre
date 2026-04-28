import { create } from 'zustand';
import { apiFetch } from '../api/client';

export interface SubData {
  plan: 'FREE' | 'PRO' | 'TEAM';
  status: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE';
  currentPeriodEnd: string | null;
  usage: {
    aiRequests: number;
    aiLimit: number;
    boards: number;
    boardLimit: number;
    collaboratorLimit: number;
  };
}

export interface LimitHit {
  type: 'ai' | 'boards' | 'room';
  plan: string;
  limit?: number;
}

interface BillingState {
  sub: SubData | null;
  isLoading: boolean;
  limitHit: LimitHit | null;

  fetchSubscription: () => Promise<void>;
  setLimitHit: (data: LimitHit) => void;
  clearLimitHit: () => void;
  createCheckoutSession: (plan: 'PRO' | 'TEAM') => Promise<string | null>;
  createPortalSession: () => Promise<string | null>;
}

export const useBillingStore = create<BillingState>((set) => ({
  sub: null,
  isLoading: false,
  limitHit: null,

  fetchSubscription: async () => {
    set({ isLoading: true });
    try {
      const res = await apiFetch('/api/billing/subscription');
      if (!res.ok) return;
      const data = (await res.json()) as SubData;
      set({ sub: data });
    } catch {
      // silently fail — billing non-critical
    } finally {
      set({ isLoading: false });
    }
  },

  setLimitHit: (data) => set({ limitHit: data }),
  clearLimitHit: () => set({ limitHit: null }),

  createCheckoutSession: async (plan) => {
    try {
      const res = await apiFetch('/api/billing/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { url: string };
      return data.url;
    } catch {
      return null;
    }
  },

  createPortalSession: async () => {
    try {
      const res = await apiFetch('/api/billing/create-portal-session', {
        method: 'POST',
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { url: string };
      return data.url;
    } catch {
      return null;
    }
  },
}));
