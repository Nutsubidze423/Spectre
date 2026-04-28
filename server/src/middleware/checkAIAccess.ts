import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/client';
import { LIMITS } from '../routes/billing';

export async function checkAIAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId },
      select: { plan: true, status: true },
    });

    const plan = sub?.plan ?? 'FREE';
    const status = sub?.status ?? 'ACTIVE';

    if (status === 'PAST_DUE') {
      res.status(403).json({ error: 'subscription_past_due' });
      return;
    }

    const limit = LIMITS[plan].aiRequestsPerDay;

    if (limit !== -1) {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      // Read current count before incrementing
      const usage = await prisma.usageTracking.findUnique({
        where: { userId_date: { userId, date: today } },
        select: { aiRequestsCount: true },
      });

      const used = usage?.aiRequestsCount ?? 0;
      if (used >= limit) {
        res.status(403).json({ error: 'limit_reached', plan, limit, used });
        return;
      }

      // Atomic increment
      await prisma.usageTracking.upsert({
        where: { userId_date: { userId, date: today } },
        create: { userId, date: today, aiRequestsCount: 1 },
        update: { aiRequestsCount: { increment: 1 } },
      });
    }

    next();
  } catch (err) {
    console.error('[checkAIAccess]', err);
    res.status(500).json({ error: 'Failed to check AI access' });
  }
}
