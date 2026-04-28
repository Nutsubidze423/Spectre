import { Router } from 'express';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

const MAX_SNAPSHOTS = 10;
const MAX_BOARD_NAME = 100;
const MAX_BOARDS_PER_USER = 50;

// ─── GET /api/boards — list user's boards ──────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const boards = await prisma.board.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        thumbnailUrl: true,
        isPublic: true,
        shareToken: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    res.json({ boards });
  } catch (err) {
    console.error('[boards/list]', err);
    res.status(500).json({ error: 'Failed to load boards' });
  }
});

// ─── POST /api/boards — create board ──────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { name } = req.body as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'name required' });
      return;
    }

    const trimmed = name.trim().slice(0, MAX_BOARD_NAME);

    const count = await prisma.board.count({ where: { userId: req.userId } });
    if (count >= MAX_BOARDS_PER_USER) {
      res.status(403).json({ error: `Board limit reached (max ${MAX_BOARDS_PER_USER})` });
      return;
    }

    const board = await prisma.board.create({
      data: { userId: req.userId, name: trimmed },
      select: {
        id: true,
        name: true,
        thumbnailUrl: true,
        isPublic: true,
        shareToken: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json({ board });
  } catch (err) {
    console.error('[boards/create]', err);
    res.status(500).json({ error: 'Failed to create board' });
  }
});

// ─── GET /api/boards/:id — get board + latest snapshot ────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const board = await prisma.board.findFirst({
      where: { id: req.params.id, userId: req.userId },
      select: {
        id: true,
        name: true,
        thumbnailUrl: true,
        isPublic: true,
        shareToken: true,
        createdAt: true,
        updatedAt: true,
        snapshots: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, elementsJson: true, createdAt: true },
        },
      },
    });

    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    res.json({ board, snapshot: board.snapshots[0] ?? null });
  } catch (err) {
    console.error('[boards/get]', err);
    res.status(500).json({ error: 'Failed to load board' });
  }
});

// ─── PATCH /api/boards/:id — rename board ─────────────────────────────────────

router.patch('/:id', async (req, res) => {
  try {
    const { name } = req.body as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim().length === 0) {
      res.status(400).json({ error: 'name required' });
      return;
    }

    const existing = await prisma.board.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    const board = await prisma.board.update({
      where: { id: req.params.id },
      data: { name: name.trim().slice(0, MAX_BOARD_NAME) },
      select: { id: true, name: true, updatedAt: true },
    });

    res.json({ board });
  } catch (err) {
    console.error('[boards/rename]', err);
    res.status(500).json({ error: 'Failed to rename board' });
  }
});

// ─── DELETE /api/boards/:id ───────────────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.board.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!existing) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    await prisma.board.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[boards/delete]', err);
    res.status(500).json({ error: 'Failed to delete board' });
  }
});

// ─── POST /api/boards/:id/save — save snapshot ────────────────────────────────

router.post('/:id/save', async (req, res) => {
  try {
    const { elements } = req.body as Record<string, unknown>;
    if (!Array.isArray(elements)) {
      res.status(400).json({ error: 'elements array required' });
      return;
    }

    const board = await prisma.board.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!board) {
      res.status(404).json({ error: 'Board not found' });
      return;
    }

    // Create new snapshot
    await prisma.boardSnapshot.create({
      data: { boardId: req.params.id, elementsJson: elements },
    });

    // Keep only last MAX_SNAPSHOTS
    const snapshots = await prisma.boardSnapshot.findMany({
      where: { boardId: req.params.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (snapshots.length > MAX_SNAPSHOTS) {
      const toDelete = snapshots.slice(MAX_SNAPSHOTS).map((s) => s.id);
      await prisma.boardSnapshot.deleteMany({ where: { id: { in: toDelete } } });
    }

    // Touch updatedAt
    await prisma.board.update({
      where: { id: req.params.id },
      data: { updatedAt: new Date() },
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[boards/save]', err);
    res.status(500).json({ error: 'Failed to save board' });
  }
});

export default router;
