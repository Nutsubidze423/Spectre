import { Router } from 'express';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/featureAccess';

const router = Router();

// GET /api/admin/overview — Team admin dashboard data
router.get('/overview', requireAuth, requireFeature('admin_dashboard'), async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: req.userId },
      select: { teamId: true, seatCount: true, plan: true },
    });
    if (!sub?.teamId) { res.status(404).json({ error: 'No team found' }); return; }

    const memberships = await prisma.teamMembership.findMany({
      where: { teamId: sub.teamId },
      include: {
        user: {
          select: {
            id: true, email: true, username: true,
            usageTracking: {
              select: { thinkingPartnerUsesThisMonth: true, challengeThinkingUsesToday: true, sessionsCompleted: true },
            },
            boards: { select: { id: true }, take: 100 },
          },
        },
      },
    });

    const members = memberships.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      email: m.user.email,
      role: m.role,
      boardCount: m.user.boards.length,
      thinkingPartnerThisMonth: m.user.usageTracking?.thinkingPartnerUsesThisMonth ?? 0,
      challengeToday: m.user.usageTracking?.challengeThinkingUsesToday ?? 0,
      sessionsCompleted: m.user.usageTracking?.sessionsCompleted ?? 0,
    }));

    res.json({
      teamId: sub.teamId,
      plan: sub.plan,
      seatCount: sub.seatCount,
      memberCount: members.length,
      members,
    });
  } catch (err) {
    console.error('[admin/overview]', err);
    res.status(500).json({ error: 'Failed to load admin data' });
  }
});

export default router;
