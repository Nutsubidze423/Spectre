import { Router } from 'express';
import _Stripe from 'stripe';
import { prisma } from '../db/client';
import { requireAuth } from '../middleware/auth';
import type { Plan, SubStatus } from '@prisma/client';

const router = Router();

// ─── Stripe client ────────────────────────────────────────────────────────────

type StripeClient = _Stripe.Stripe;

function getStripe(): StripeClient {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
  return new _Stripe(key, { apiVersion: '2026-04-22.dahlia' });
}

// ─── Plan limits (single source of truth) ─────────────────────────────────────

export const LIMITS: Record<Plan, { collaborators: number; aiRequestsPerDay: number; savedBoards: number }> = {
  FREE:  { collaborators: 5,  aiRequestsPerDay: 3,   savedBoards: 3  },
  PRO:   { collaborators: 20, aiRequestsPerDay: 100,  savedBoards: -1 },
  TEAM:  { collaborators: 50, aiRequestsPerDay: -1,   savedBoards: -1 },
};

// ─── Helper: get or create Stripe customer ────────────────────────────────────

async function getOrCreateCustomer(stripe: StripeClient, userId: string, email: string): Promise<string> {
  const existing = await prisma.subscription.findUnique({
    where: { userId },
    select: { stripeCustomerId: true },
  });
  if (existing) return existing.stripeCustomerId;

  const customer = await stripe.customers.create({ email, metadata: { userId } });
  return customer.id;
}

// ─── Minimal webhook object shapes (only fields we use) ───────────────────────

interface WH_CheckoutSession {
  metadata?: Record<string, string>;
  customer?: string | null;
  subscription?: string | null;
}
interface WH_Subscription {
  id: string;
  customer: string;
  status: string;
  current_period_end: number;
  items: { data: Array<{ price: { id: string } }> };
}
interface WH_Invoice {
  customer: string;
}
interface WH_Event {
  type: string;
  data: { object: unknown };
}

// ─── POST /api/billing/webhook ────────────────────────────────────────────────
// Must use express.raw() body — registered separately in index.ts

export async function webhookHandler(req: import('express').Request, res: import('express').Response): Promise<void> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[billing/webhook] STRIPE_WEBHOOK_SECRET not set');
    res.sendStatus(200);
    return;
  }

  let event: WH_Event;
  try {
    const stripe = getStripe();
    const sig = req.headers['stripe-signature'] as string;
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret) as WH_Event;
  } catch (err) {
    console.error('[billing/webhook] signature verification failed:', err);
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  try {
    await handleWebhookEvent(event);
  } catch (err) {
    // Always 200 — log but never let Stripe retry-loop
    console.error('[billing/webhook] handler error:', err);
  }

  res.sendStatus(200);
}

async function handleWebhookEvent(event: WH_Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as WH_CheckoutSession;
      const userId = session.metadata?.userId;
      const customerId = session.customer;
      const subscriptionId = session.subscription ?? null;
      if (!userId || !customerId) return;

      const stripe = getStripe();
      let plan: Plan = 'PRO';
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = sub.items.data[0]?.price.id;
        plan = resolvePlan(priceId);
      }

      await prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId ?? undefined,
          plan,
          status: 'ACTIVE',
        },
        update: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId ?? undefined,
          plan,
          status: 'ACTIVE',
        },
      });
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as WH_Subscription;
      const priceId = sub.items.data[0]?.price.id;
      const plan = resolvePlan(priceId);
      const status = resolveStatus(sub.status);
      const currentPeriodEnd = new Date(sub.current_period_end * 1000);

      await prisma.subscription.updateMany({
        where: { stripeCustomerId: sub.customer },
        data: { plan, status, currentPeriodEnd, stripeSubscriptionId: sub.id },
      });
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as WH_Subscription;

      await prisma.subscription.updateMany({
        where: { stripeCustomerId: sub.customer },
        data: { plan: 'FREE', status: 'CANCELLED', stripeSubscriptionId: null, currentPeriodEnd: null },
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as WH_Invoice;

      await prisma.subscription.updateMany({
        where: { stripeCustomerId: invoice.customer },
        data: { status: 'PAST_DUE' },
      });
      break;
    }

    default:
      break;
  }
}

function resolvePlan(priceId: string | undefined): Plan {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'PRO';
  if (priceId === process.env.STRIPE_TEAM_PRICE_ID) return 'TEAM';
  return 'FREE';
}

function resolveStatus(stripeStatus: string): SubStatus {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'ACTIVE';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'PAST_DUE';
  return 'CANCELLED';
}

// ─── POST /api/billing/create-checkout-session ────────────────────────────────

router.post('/create-checkout-session', requireAuth, async (req, res) => {
  try {
    const { plan } = req.body as { plan?: string };
    if (plan !== 'PRO' && plan !== 'TEAM') {
      res.status(400).json({ error: 'plan must be PRO or TEAM' });
      return;
    }

    const priceId = plan === 'PRO'
      ? process.env.STRIPE_PRO_PRICE_ID
      : process.env.STRIPE_TEAM_PRICE_ID;

    if (!priceId) {
      res.status(500).json({ error: `STRIPE_${plan}_PRICE_ID not configured` });
      return;
    }

    const stripe = getStripe();
    const customerId = await getOrCreateCustomer(stripe, req.userId, req.userEmail);

    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: req.userId },
      success_url: `${clientUrl}?billing=success`,
      cancel_url: `${clientUrl}?billing=cancelled`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing/create-checkout-session]', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ─── POST /api/billing/create-portal-session ──────────────────────────────────

router.post('/create-portal-session', requireAuth, async (req, res) => {
  try {
    const sub = await prisma.subscription.findUnique({
      where: { userId: req.userId },
      select: { stripeCustomerId: true },
    });

    if (!sub) {
      res.status(404).json({ error: 'No billing account found' });
      return;
    }

    const stripe = getStripe();
    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${clientUrl}?view=account`,
    });

    res.json({ url: portal.url });
  } catch (err) {
    console.error('[billing/create-portal-session]', err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ─── GET /api/billing/subscription ───────────────────────────────────────────

router.get('/subscription', requireAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [sub, usage, boardCount] = await Promise.all([
      prisma.subscription.findUnique({ where: { userId: req.userId } }),
      prisma.usageTracking.findUnique({
        where: { userId_date: { userId: req.userId, date: today } },
      }),
      prisma.board.count({ where: { userId: req.userId } }),
    ]);

    const plan: Plan = sub?.plan ?? 'FREE';
    const status: SubStatus = sub?.status ?? 'ACTIVE';
    const limits = LIMITS[plan];

    res.json({
      plan,
      status,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      usage: {
        aiRequests: usage?.aiRequestsCount ?? 0,
        aiLimit: limits.aiRequestsPerDay,
        boards: boardCount,
        boardLimit: limits.savedBoards,
        collaboratorLimit: limits.collaborators,
      },
    });
  } catch (err) {
    console.error('[billing/subscription]', err);
    res.status(500).json({ error: 'Failed to load subscription' });
  }
});

export default router;
