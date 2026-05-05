import { Router } from 'express';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/featureAccess';

const router = Router();

router.get('/overview', requireAuth, requireFeature('admin_dashboard'), async (req, res) => {
  try {
    const userId = req.userId!;

    // Find all memberships in the same team as the requesting user
    const myMembership = await prisma.teamMembership.findFirst({ where: { userId } });
    const teamId = myMembership?.teamId;
    if (!teamId) { res.status(404).json({ error: 'No team found' }); return; }

    const memberships = await prisma.teamMembership.findMany({
      where: { teamId },
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

    res.json({ teamId, memberCount: members.length, members });
  } catch (err) {
    console.error('[admin/overview]', err);
    res.status(500).json({ error: 'Failed to load admin data' });
  }
});

export default router;
