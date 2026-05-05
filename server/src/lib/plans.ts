import type { Plan } from '@prisma/client';
import { prisma } from '../db/client';

export type FeatureKey =
  | 'thinking_partner'
  | 'canvas_memory'
  | 'challenge_thinking'
  | 'session_summary'
  | 'explain_mode'
  | 'guest_view_links'
  | 'team_memory'
  | 'admin_dashboard';

export interface PlanLimits {
  collaborators: number;
  savedBoards: number;
  thinkingPartnerPerMonth: number; // -1 = unlimited
  challengeThinkingPerDay: number; // 0 = blocked, -1 = unlimited
}

export const LIMITS: Record<Plan, PlanLimits> = {
  FREE: { collaborators: 3,  savedBoards: 3,  thinkingPartnerPerMonth: 5,  challengeThinkingPerDay: 0  },
  SOLO: { collaborators: 5,  savedBoards: -1, thinkingPartnerPerMonth: -1, challengeThinkingPerDay: 10 },
  PRO:  { collaborators: 15, savedBoards: -1, thinkingPartnerPerMonth: -1, challengeThinkingPerDay: -1 },
  TEAM: { collaborators: 50, savedBoards: -1, thinkingPartnerPerMonth: -1, challengeThinkingPerDay: -1 },
};

export const PLAN_FEATURES: Record<Plan, FeatureKey[]> = {
  FREE: [],
  SOLO: ['canvas_memory', 'challenge_thinking', 'session_summary'],
  PRO:  ['canvas_memory', 'challenge_thinking', 'session_summary', 'explain_mode', 'guest_view_links'],
  TEAM: ['canvas_memory', 'challenge_thinking', 'session_summary', 'explain_mode', 'guest_view_links', 'team_memory', 'admin_dashboard'],
};

export const UPGRADE_MESSAGES: Record<string, { title: string; body: string; requiredPlan: Plan }> = {
  thinking_partner_limit: {
    title: 'Thinking Partner limit reached',
    body: "You've used your 5 free Thinking Partner sessions this month. Upgrade to Solo for unlimited — $9/month.",
    requiredPlan: 'SOLO',
  },
  canvas_memory: {
    title: 'Canvas Memory',
    body: 'Canvas Memory saves every session so Spectre remembers your thinking. Available on Solo — $9/month.',
    requiredPlan: 'SOLO',
  },
  challenge_thinking: {
    title: 'Challenge Thinking',
    body: 'Get brutally honest AI critique of your diagrams — logical gaps, contradictions, blind spots. Available on Solo — $9/month.',
    requiredPlan: 'SOLO',
  },
  challenge_thinking_limit: {
    title: 'Challenge Thinking limit reached',
    body: "You've used all 10 daily challenges. Upgrade to Pro for unlimited — $19/month.",
    requiredPlan: 'PRO',
  },
  session_summary: {
    title: 'Session Summary',
    body: 'Export AI-generated session summaries to Notion, Slack, or Linear. Available on Solo — $9/month.',
    requiredPlan: 'SOLO',
  },
  explain_mode: {
    title: 'Explain Mode',
    body: 'Turn any topic into a step-by-step visual explanation with replayable animations. Available on Pro — $19/month.',
    requiredPlan: 'PRO',
  },
  guest_view_links: {
    title: 'Guest View Links',
    body: 'Share board replays with anyone — no account needed. Available on Pro — $19/month.',
    requiredPlan: 'PRO',
  },
  team_memory: {
    title: 'Team Memory',
    body: "Shared memory across your entire team — surfaces connections between every member's past thinking. Team plan only.",
    requiredPlan: 'TEAM',
  },
  admin_dashboard: {
    title: 'Admin Dashboard',
    body: 'Usage stats, member management, and board oversight for your team. Team plan only.',
    requiredPlan: 'TEAM',
  },
};

export async function getUserPlan(userId: string): Promise<Plan> {
  const sub = await prisma.subscription.findUnique({
    where: { userId },
    select: { plan: true, status: true },
  });
  if (!sub || sub.status === 'CANCELLED' || sub.status === 'PAST_DUE') return 'FREE';
  return sub.plan;
}

export function hasFeature(plan: Plan, feature: FeatureKey): boolean {
  return (PLAN_FEATURES[plan] as string[]).includes(feature);
}
