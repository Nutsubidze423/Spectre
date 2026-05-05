import Stripe from 'stripe';
import { Router } from 'express';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import { LIMITS, getUserPlan } from '../lib/plans';
import type { Plan, SubStatus } from '@prisma/client';

const router = Router();

type StripeClient = InstanceType<typeof Stripe>;
type StripeEvent  = ReturnType<StripeClient['webhooks']['constructEvent']>;

function getStripe(): StripeClient {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(key);
}

function resolvePlan(priceId: string | undefined): Plan {
  if (priceId === process.env.STRIPE_SOLO_PRICE_ID) return 'SOLO';
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'PRO';
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return 'TEAM';
  return 'FREE';
}

function resolveStatus(s: string): SubStatus {
  if (s === 'active' || s === 'trialing') return 'ACTIVE';
  if (s === 'past_due') return 'PAST_DUE';
  return 'CANCELLED';
}

async function getSubPriceId(stripe: StripeClient, subId: string): Promise<string | undefined> {
  const sub = await stripe.subscriptions.retrieve(subId);
  return sub.items.data[0]?.price?.id;
}

export async function webhookHandler(req: import('express').Request, res: import('express').Response): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) { console.error('[billing/webhook] STRIPE_WEBHOOK_SECRET not set'); res.sendStatus(200); return; }
  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) { res.status(400).send('Missing stripe-signature'); return; }
  let event: StripeEvent;
  try {
    event = getStripe().webhooks.constructEvent((req.body as Buffer).toString(), sig, secret);
  } catch (err) {
    console.error('[billing/webhook] signature failed:', err);
    res.status(400).send('Webhook signature verification failed');
    return;
  }
  try { await handleEvent(event); } catch (err) { console.error('[billing/webhook] handler error:', err); }
  res.sendStatus(200);
}

async function handleEvent(event: StripeEvent): Promise<void> {
  const obj = event.data.object as unknown as Record<string, unknown>;
  switch (event.type) {
    case 'checkout.session.completed': {
      const userId = (obj.metadata as Record<string, string> | null)?.userId;
      if (!userId) return;
      const subId = obj.subscription as string | null;
      const priceId = subId ? await getSubPriceId(getStripe(), subId) : undefined;
      const plan = resolvePlan(priceId);
      await prisma.subscription.upsert({
        where: { userId },
        create: { userId, stripeCustomerId: obj.customer as string, stripeSubscriptionId: subId, plan, status: 'ACTIVE' },
        update: { stripeCustomerId: obj.customer as string, stripeSubscriptionId: subId, plan, status: 'ACTIVE' },
      });
      break;
    }
    case 'customer.subscription.updated': {
      const items = (obj.items as { data: { price: { id: string } }[] } | null)?.data;
      const plan   = resolvePlan(items?.[0]?.price?.id);
      const status = resolveStatus(obj.status as string);
      await prisma.subscription.updateMany({
        where: { stripeCustomerId: obj.customer as string },
        data: { plan, status, currentPeriodEnd: new Date((obj.current_period_end as number) * 1000), cancelAtPeriodEnd: obj.cancel_at_period_end as boolean, stripeSubscriptionId: obj.id as string },
      });
      break;
    }
    case 'customer.subscription.deleted': {
      await prisma.subscription.updateMany({
        where: { stripeCustomerId: obj.customer as string },
        data: { plan: 'FREE', status: 'CANCELLED', stripeSubscriptionId: null, currentPeriodEnd: null, cancelAtPeriodEnd: false },
      });
      break;
    }
    case 'invoice.payment_failed': {
      await prisma.subscription.updateMany({
        where: { stripeCustomerId: obj.customer as string },
        data: { status: 'PAST_DUE' },
      });
      break;
    }
  }
}

router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body as { plan?: string };
    if (plan !== 'SOLO' && plan !== 'PRO' && plan !== 'TEAM') { res.status(400).json({ error: 'plan must be SOLO, PRO, or TEAM' }); return; }
    const priceId = plan === 'SOLO' ? process.env.STRIPE_SOLO_PRICE_ID : plan === 'PRO' ? process.env.STRIPE_PRO_PRICE_ID : process.env.STRIPE_TEAM_PRICE_ID;
    if (!priceId) { res.status(500).json({ error: 'STRIPE_' + plan + '_PRICE_ID not configured' }); return; }
    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: req.userId! },
      success_url: clientUrl + '?checkout=success',
      cancel_url: clientUrl + '?checkout=cancelled',
    });
    res.json({ checkoutUrl: session.url });
  } catch (err) { console.error('[billing/create-checkout-session]', err); res.status(500).json({ error: 'Failed to create checkout session' }); }
});

router.post('/create-portal-session', requireAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({ where: { userId: req.userId }, select: { stripeCustomerId: true } });
    if (!sub?.stripeCustomerId) { res.status(404).json({ error: 'No billing account found' }); return; }
    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
    const portal = await getStripe().billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: clientUrl });
    res.json({ portalUrl: portal.url });
  } catch (err) { console.error('[billing/create-portal-session]', err); res.status(500).json({ error: 'Failed to create portal session' }); }
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
    res.json({ plan, status, currentPeriodEnd: sub?.currentPeriodEnd ?? null, cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      usage: { thinkingPartnerThisMonth: usage?.thinkingPartnerUsesThisMonth ?? 0, thinkingPartnerLimit: limits.thinkingPartnerPerMonth,
        challengeToday: usage?.challengeThinkingUsesToday ?? 0, challengeLimit: limits.challengeThinkingPerDay,
        boards: boardCount, boardLimit: limits.savedBoards, collaboratorLimit: limits.collaborators } });
  } catch (err) { console.error('[billing/subscription]', err); res.status(500).json({ error: 'Failed to load subscription' }); }
});

void getUserPlan;
export { LIMITS };
export default router;
