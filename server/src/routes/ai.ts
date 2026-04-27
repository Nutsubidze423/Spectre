import { Router } from 'express';

// Phase 4: POST /api/ai/draw — Claude API proxy for canvas AI assistant.
const router = Router();

router.post('/draw', (_req, res) => {
  res.status(501).json({ error: 'Phase 4 — not yet implemented' });
});

export default router;
