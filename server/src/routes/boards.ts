import { Router } from 'express';

// Phase 5: CRUD boards, snapshots, share links, export.
const router = Router();

router.get('/', (_req, res) => {
  res.status(501).json({ error: 'Phase 5 — not yet implemented' });
});

router.post('/', (_req, res) => {
  res.status(501).json({ error: 'Phase 5 — not yet implemented' });
});

router.get('/:id', (_req, res) => {
  res.status(501).json({ error: 'Phase 5 — not yet implemented' });
});

router.delete('/:id', (_req, res) => {
  res.status(501).json({ error: 'Phase 5 — not yet implemented' });
});

export default router;
