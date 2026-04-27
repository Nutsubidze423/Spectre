import { Router } from 'express';

// Phase 5: register, login, refresh, logout endpoints.
const router = Router();

router.post('/register', (_req, res) => {
  res.status(501).json({ error: 'Phase 5 — not yet implemented' });
});

router.post('/login', (_req, res) => {
  res.status(501).json({ error: 'Phase 5 — not yet implemented' });
});

router.post('/refresh', (_req, res) => {
  res.status(501).json({ error: 'Phase 5 — not yet implemented' });
});

router.post('/logout', (_req, res) => {
  res.status(501).json({ error: 'Phase 5 — not yet implemented' });
});

export default router;
