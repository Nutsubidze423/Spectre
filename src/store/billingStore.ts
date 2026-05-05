import { create } from 'zustand';
import { apiFetch } from '../api/client';

export interface SubData {
  plan: 'FREE' | 'SOLO' | 'PRO' | 'TEAM';
  status: 'ACTIVE' | 'CANCELLED' | 'PAST_DUE';
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: {
    thinkingPartnerThisMonth: number;
    thinkingPartnerLimit: number;
    challengeToday: number;
    challengeLimit: number;
    boards: number;
    boardLimit: number;
    collaboratorLimit: number;
  };
}

export interface GateHit {
  feature: string;
  title: string;
  body: string;
  requiredPlan: 'SOLO' | 'PRO' | 'TEAM';
}

interface BillingState {
  sub: SubData | null;
  isLoading: boolean;
  gateHit: GateHit | null;

  fetchSubscription: () => Promise<void>;
  setGateHit: (data: GateHit) => void;
  clearGateHit: () => void;
  createCheckoutSession: (plan: 'SOLO' | 'PRO' | 'TEAM') => Promise<string | null>;
  createPortalSession: () => Promise<string | null>;
}

export const useBillingStore = create<BillingState>((set) => ({
  sub: null,
  isLoading: false,
  gateHit: null,

  fetchSubscription: async () => {
    set({ isLoading: true });
    try {
      const res = await apiFetch('/api/billing/subscription');
      if (!res.ok) return;
      const data = (await res.json()) as SubData;
      set({ sub: data });
    } catch {
      // silently fail
    } finally {
      set({ isLoading: false });
    }
  },

  setGateHit: (data) => set({ gateHit: data }),
  clearGateHit: () => set({ gateHit: null }),

  createCheckoutSession: async (plan) => {
    try {
      const res = await apiFetch('/api/billing/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { checkoutUrl: string };
      return data.checkoutUrl;
    } catch {
      return null;
    }
  },

  createPortalSession: async () => {
    try {
      const res = await apiFetch('/api/billing/create-portal-session', { method: 'POST' });
      if (!res.ok) return null;
      const data = (await res.json()) as { portalUrl: string };
      return data.portalUrl;
    } catch {
      return null;
    }
  },
}));
