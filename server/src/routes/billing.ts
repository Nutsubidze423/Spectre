import { Router } from 'express';
import { Paddle, Environment } from '@paddle/paddle-node-sdk';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { LIMITS, getUserPlan } from '../lib/plans';
import type { Plan, SubStatus } from '@prisma/client';

const router = Router();

let _paddle: Paddle | null = null;

function getPaddle(): Paddle {
  if (_paddle) return _paddle;
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error('PADDLE_API_KEY not configured');
  _paddle = new Paddle(key, {
    environment: process.env.NODE_ENV === 'production'
      ? Environment.production
      : Environment.sandbox,
  });
  return _paddle;
}

function resolvePlan(priceId: string | undefined): Plan {
  if (priceId === process.env.PADDLE_SOLO_PRICE_ID) return 'SOLO';
  if (priceId === process.env.PADDLE_PRO_PRICE_ID) return 'PRO';
  if (priceId === process.env.PADDLE_TEAM_PRICE_ID) return 'TEAM';
  return 'FREE';
}

function resolveStatus(paddleStatus: string): SubStatus {
  if (paddleStatus === 'active' || paddleStatus === 'trialing') return 'ACTIVE';
  if (paddleStatus === 'past_due' || paddleStatus === 'paused') return 'PAST_DUE';
  return 'CANCELLED';
}

export async function webhookHandler(
  req: import('express').Request,
  res: import('express').Response,
): Promise<void> {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[billing/webhook] PADDLE_WEBHOOK_SECRET not set');
    res.sendStatus(200);
    return;
  }

  const signature = req.headers['paddle-signature'] as string | undefined;
  if (!signature) {
    res.status(400).send('Missing paddle-signature header');
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let event: any;
  try {
    event = await getPaddle().webhooks.unmarshal(
      (req.body as Buffer).toString(),
      secret,
      signature,
    );
  } catch (err) {
    console.error('[billing/webhook] signature verification failed:', err);
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  if (!event) { res.status(400).send('Webhook signature verification failed'); return; }

  try { await handlePaddleEvent(event); } catch (err) {
    console.error('[billing/webhook] handler error:', err);
  }

  res.sendStatus(200);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handlePaddleEvent(event: any): Promise<void> {
  const eventType = event.eventType as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = event.data as Record<string, any>;

  switch (eventType) {
    case 'subscription.activated': {
      const userId = (data.customData as Record<string, string> | null)?.userId;
      if (!userId) { console.warn('[webhook] subscription.activated: missing userId in customData'); return; }
      const priceId = data.items?.[0]?.price?.id as string | undefined;
      const plan = resolvePlan(priceId);
      const currentPeriodEnd = data.currentBillingPeriod?.endsAt
        ? new Date(data.currentBillingPeriod.endsAt as string) : null;
      await prisma.subscription.upsert({
        where: { userId },
        create: { userId, paddleCustomerId: data.customerId as string, paddleSubscriptionId: data.id as string, plan, status: 'ACTIVE', currentPeriodEnd },
        update: { paddleCustomerId: data.customerId as string, paddleSubscriptionId: data.id as string, plan, status: 'ACTIVE', currentPeriodEnd },
      });
      break;
    }
    case 'subscription.updated': {
      const priceId = data.items?.[0]?.price?.id as string | undefined;
      const plan = resolvePlan(priceId);
      const status = resolveStatus(data.status as string);
      const currentPeriodEnd = data.currentBillingPeriod?.endsAt
        ? new Date(data.currentBillingPeriod.endsAt as string) : null;
      await prisma.subscription.updateMany({
        where: { paddleCustomerId: data.customerId as string },
        data: { plan, status, currentPeriodEnd, paddleSubscriptionId: data.id as string },
      });
      break;
    }
    case 'subscription.canceled': {
      await prisma.subscription.updateMany({
        where: { paddleCustomerId: data.customerId as string },
        data: { plan: 'FREE', status: 'CANCELLED', paddleSubscriptionId: null, currentPeriodEnd: null },
      });
      break;
    }
    case 'transaction.payment_failed': {
      await prisma.subscription.updateMany({
        where: { paddleCustomerId: data.customerId as string },
        data: { status: 'PAST_DUE' },
      });
      break;
    }
  }
}

router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body as { plan?: string };
    if (plan !== 'SOLO' && plan !== 'PRO' && plan !== 'TEAM') {
      res.status(400).json({ error: 'plan must be SOLO, PRO, or TEAM' }); return;
    }
    const priceId = plan === 'SOLO'
      ? process.env.PADDLE_SOLO_PRICE_ID
      : plan === 'PRO'
        ? process.env.PADDLE_PRO_PRICE_ID
        : process.env.PADDLE_TEAM_PRICE_ID;
    if (!priceId) { res.status(500).json({ error: `PADDLE_${plan}_PRICE_ID not configured` }); return; }

    const transaction = await getPaddle().transactions.create({
      items: [{ priceId, quantity: 1 }],
      customData: { userId: req.userId },
    });

    res.json({ transactionId: transaction?.id });
  } catch (err) {
    console.error('[billing/create-checkout-session]', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

router.post('/create-portal-session', requireAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: req.userId },
      select: { paddleCustomerId: true },
    });
    if (!sub?.paddleCustomerId) { res.status(404).json({ error: 'No billing account found' }); return; }

    const portal = await getPaddle().customerPortalSessions.create(sub.paddleCustomerId, []);
    res.json({ portalUrl: portal?.urls?.general?.overview });
  } catch (err) {
    console.error('[billing/create-portal-session]', err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

router.get('/subscription', requireAuth, async (req, res) => {
  try {
    const [sub, usage, boardCount] = await Promise.all([
      prisma.subscription.findUnique({ where: { userId: req.userId } }),
      prisma.usageTracking.findUnique({ where: { userId: req.userId } }),
      prisma.board.count({ where: { userId: req.userId } }),
    ]);
    const plan: Plan = sub?.plan ?? 'FREE';
    const status: SubStatus = sub?.status ?? 'ACTIVE';
    const limits = LIMITS[plan];
    res.json({
      plan, status, currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      usage: {
        thinkingPartnerThisMonth: usage?.thinkingPartnerUsesThisMonth ?? 0,
        thinkingPartnerLimit: limits.thinkingPartnerPerMonth,
        challengeToday: usage?.challengeThinkingUsesToday ?? 0,
        challengeLimit: limits.challengeThinkingPerDay,
        boards: boardCount, boardLimit: limits.savedBoards,
        collaboratorLimit: limits.collaborators,
      },
    });
  } catch (err) {
    console.error('[billing/subscription]', err);
    res.status(500).json({ error: 'Failed to load subscription' });
  }
});

void getUserPlan;
export { LIMITS };
export default router;
