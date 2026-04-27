import type { Request, Response, NextFunction } from 'express';

// Phase 5: verifies JWT access token, attaches userId to req.
export function requireAuth(_req: Request, res: Response, next: NextFunction): void {
  // Phase 5 implementation — for now pass through
  res.status(401).json({ error: 'Phase 5 — auth not yet implemented' });
  void next;
}
