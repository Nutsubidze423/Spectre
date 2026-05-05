import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/client';

// Core AI draw: no usage restrictions per spec ('core mechanic, no restrictions').
// Only block PAST_DUE to prevent cost accrual without payment.
export async function checkAIAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId }, select: { status: true } });
    if (sub?.status === 'PAST_DUE') {
      res.status(403).json({ error: 'subscription_past_due' }); return;
    }
    next();
  } catch (err) {
    console.error('[checkAIAccess]', err);
    next(); // fail open — never break core canvas
  }
}
