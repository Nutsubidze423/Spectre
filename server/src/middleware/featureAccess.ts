import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/client';
import { LIMITS, PLAN_FEATURES, UPGRADE_MESSAGES, getUserPlan } from '../lib/plans';
import type { FeatureKey } from '../lib/plans';

function needsDailyReset(lastReset: Date): boolean {
  return new Date().toDateString() !== lastReset.toDateString();
}

function needsMonthlyReset(lastReset: Date): boolean {
  const now = new Date();
  return now.getFullYear() !== lastReset.getFullYear() || now.getMonth() !== lastReset.getMonth();
}

async function getOrCreateUsage(userId: string) {
  return prisma.usageTracking.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export function requireFeature(feature: FeatureKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.userId;
    if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }

    try {
      const plan = await getUserPlan(userId);

      if (feature === 'thinking_partner') {
        const limit = LIMITS[plan].thinkingPartnerPerMonth;
        if (limit === -1) {
          await prisma.usageTracking.upsert({
            where: { userId }, create: { userId, thinkingPartnerUsesThisMonth: 1 },
            update: { thinkingPartnerUsesThisMonth: { increment: 1 } },
          });
          next(); return;
        }
        let usage = await getOrCreateUsage(userId);
        if (needsMonthlyReset(usage.thinkingPartnerMonthReset)) {
          usage = await prisma.usageTracking.update({
            where: { userId },
            data: { thinkingPartnerUsesThisMonth: 0, thinkingPartnerMonthReset: new Date() },
          });
        }
        if (usage.thinkingPartnerUsesThisMonth >= limit) {
          const msg = UPGRADE_MESSAGES['thinking_partner_limit'];
          res.status(403).json({ error: 'feature_limit_reached', feature, ...msg }); return;
        }
        await prisma.usageTracking.update({
          where: { userId }, data: { thinkingPartnerUsesThisMonth: { increment: 1 } },
        });
        next(); return;
      }

      if (feature === 'challenge_thinking') {
        const limit = LIMITS[plan].challengeThinkingPerDay;
        if (limit === 0) {
          const msg = UPGRADE_MESSAGES['challenge_thinking'];
          res.status(403).json({ error: 'feature_not_available', feature, ...msg }); return;
        }
        if (limit === -1) { next(); return; }
        let usage = await getOrCreateUsage(userId);
        if (needsDailyReset(usage.challengeDayReset)) {
          usage = await prisma.usageTracking.update({
            where: { userId }, data: { challengeThinkingUsesToday: 0, challengeDayReset: new Date() },
          });
        }
        if (usage.challengeThinkingUsesToday >= limit) {
          const msg = UPGRADE_MESSAGES['challenge_thinking_limit'];
          res.status(403).json({ error: 'feature_limit_reached', feature, ...msg }); return;
        }
        await prisma.usageTracking.update({
          where: { userId }, data: { challengeThinkingUsesToday: { increment: 1 } },
        });
        next(); return;
      }

      // Binary gate for all other features
      if (!(PLAN_FEATURES[plan] as string[]).includes(feature)) {
        const msg = UPGRADE_MESSAGES[feature] ?? { title: 'Feature not available', body: 'Upgrade to access this feature.', requiredPlan: 'SOLO' };
        res.status(403).json({ error: 'feature_not_available', feature, ...msg }); return;
      }
      next();
    } catch (err) {
      console.error('[featureAccess]', err);
      res.status(500).json({ error: 'Failed to check feature access' });
    }
  };
}
