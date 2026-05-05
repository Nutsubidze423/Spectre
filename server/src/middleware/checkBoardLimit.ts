import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/client';
import { LIMITS, getUserPlan } from '../lib/plans';

export async function checkBoardLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'Authentication required' }); return; }
  try {
    const plan = await getUserPlan(userId);
    const limit = LIMITS[plan].savedBoards;
    if (limit === -1) { next(); return; }
    const count = await prisma.board.count({ where: { userId } });
    if (count >= limit) {
      res.status(403).json({ error: 'board_limit_reached', plan, limit });
      return;
    }
    next();
  } catch (err) {
    console.error('[checkBoardLimit]', err);
    res.status(500).json({ error: 'Failed to check board limit' });
  }
}
