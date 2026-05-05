# Spectre — Deployment Guide

## 1. Project Overview

Spectre is a real-time collaborative whiteboard with AI-assisted drawing, Thinking Partner mode, Challenge Thinking, Canvas Memory, and board replay. It runs as a monorepo: a React SPA (Vite) and an Express/Socket.io server, deployed together on Railway.

```
Frontend  →  React 18 + Vite + TypeScript + Canvas API + Rough.js
Backend   →  Node.js + Express + Socket.io + Prisma + PostgreSQL + Redis
Payments  →  Stripe (Checkout + Customer Portal + Webhooks)
AI        →  Anthropic Claude (claude-haiku-4-5 for most calls, claude-sonnet-4-6 for Challenge Thinking)
```

---

## 2. Environment Variables

### Server (`server/.env`)

```env
# Core
NODE_ENV=production
PORT=3001
CLIENT_URL=https://your-frontend-domain.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/spectre

# Redis
REDIS_URL=redis://host:6379

# Auth
JWT_SECRET=<random 64-char hex>
JWT_REFRESH_SECRET=<random 64-char hex>

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SOLO_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_TEAM_PRICE_ID=price_...
```

### Frontend (Vite build env)

```env
VITE_API_URL=https://your-backend-domain.com
```

`src/api/client.ts` reads `import.meta.env.VITE_API_URL` with fallback to empty string (same-origin proxy in dev).

---

## 3. Database Schema

Run migrations with Prisma:

```bash
cd server
npx prisma migrate deploy
```

Key models:

| Model | Purpose |
|---|---|
| `User` | Auth — email, username, bcrypt password hash |
| `Subscription` | Stripe subscription per user (plan, status, stripeCustomerId, stripeSubscriptionId, currentPeriodEnd) |
| `UsageTracking` | Per-user counters — thinkingPartnerUsesThisMonth, challengeThinkingUsesToday + reset timestamps |
| `Board` | Canvas board metadata (name, userId, updatedAt) |
| `BoardSnapshot` | Serialised element array per save (last 10 kept per board) |
| `MemoryNode` | AI session summaries per board (keyTopics, summary, boardId) |
| `TeamMembership` | Team plan member→owner relationship |

Plans: `FREE`, `SOLO`, `PRO`, `TEAM` (Prisma enum).

---

## 4. Deployment Steps

### Railway (recommended)

1. Create two Railway services from the repo: `frontend` and `server`.
2. Set build command for `server`: `cd server && npm install && npx prisma generate && npm run build`
3. Set start command for `server`: `node dist/index.js`
4. Set build command for `frontend`: `npm install && npm run build`
5. Set start command for `frontend`: serve the `dist/` folder (e.g. `npx serve dist -s`).
6. Add a PostgreSQL plugin and a Redis plugin in Railway; copy the generated URLs into env vars.
7. Set all env vars above in Railway's variable panel for each service.
8. Run `npx prisma migrate deploy` once via Railway's one-off command or locally with `DATABASE_URL` pointed at prod.

### Stripe setup

1. Create three recurring prices in Stripe dashboard: Solo ($9/mo), Pro ($19/mo), Team ($49/mo).
2. Copy each price ID into `STRIPE_SOLO_PRICE_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_TEAM_PRICE_ID`.
3. Add a webhook endpoint pointing to `https://your-backend/api/billing/webhook`.
4. Enable events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.
5. Copy the webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

---

## 5. Feature Flag Reference

Feature access is controlled entirely in `server/src/lib/plans.ts`. No runtime flags — plan tier determines access.

| Feature key | FREE | SOLO | PRO | TEAM |
|---|---|---|---|---|
| AI draw (core) | ✓ | ✓ | ✓ | ✓ |
| Thinking Partner | 5/month | unlimited | unlimited | unlimited |
| Challenge Thinking | — | 10/day | unlimited | unlimited |
| Canvas Memory | — | ✓ | ✓ | ✓ |
| Session Summary | — | ✓ | ✓ | ✓ |
| Explain Mode | — | — | ✓ | ✓ |
| Guest View Links | — | — | ✓ | ✓ |
| Team Memory | — | — | — | ✓ |
| Admin Dashboard | — | — | — | ✓ |
| Saved boards | 3 | unlimited | unlimited | unlimited |
| Collaborators/room | 3 | 5 | 15 | 50 |

To change limits: edit `LIMITS` in `server/src/lib/plans.ts` and redeploy server. No migration required.

---

## 6. API Cost Reference

All AI calls proxy through the Spectre backend — no API keys on the client.

| Endpoint | Model | Notes |
|---|---|---|
| `POST /api/ai/draw` | claude-haiku-4-5 | Vision call with canvas screenshot + prompt |
| `POST /api/ai/thinking-partner` | claude-haiku-4-5 | SSE stream, layout nodes from speech/text |
| `POST /api/ai/challenge` | claude-sonnet-4-6 | SSE stream, Challenge Thinking mode |
| `POST /api/memory/generate` | claude-haiku-4-5 | Session summary, fire-and-forget on board exit |

Haiku: ~$0.25/MTok input, $1.25/MTok output. Sonnet: ~$3/MTok input, $15/MTok output.

Rate limits enforced server-side via `UsageTracking` before the Anthropic call is made.

---

## 7. Architecture Decisions

| Decision | Rationale |
|---|---|
| Monorepo (root + server/) | Single repo, easier Railway linking |
| Prisma ORM | Type-safe queries, migration history, easy schema changes |
| JWT access (15m) + refresh cookie (7d) | Short-lived access token in memory prevents XSS token theft; HttpOnly refresh cookie is CSRF-safe on path `/api/auth` |
| Redis for room state | Rooms are ephemeral — no need for DB rows, 48hr TTL auto-cleans |
| Canvas API (not SVG/WebGL) | Simpler hit-testing, Rough.js renders natively, sufficient for whiteboard scale |
| Stripe redirect checkout | No Stripe.js bundle on frontend; redirect keeps PCI scope minimal |
| Single `requireFeature` middleware factory | All feature gating in one place; returns `{ title, body, requiredPlan }` so frontend upgrade modals are always context-specific |
| Plans lib isolated from routes | Prevents circular imports between `billing.ts` (router) and `featureAccess.ts` (middleware) |
| Haiku for most AI, Sonnet for Challenge only | Challenge Thinking requires deeper reasoning; Haiku is sufficient for drawing + layout |

---

## 8. Known Limitations

- **Thumbnails in-memory only**: Board thumbnails are captured at 28% JPEG quality and stored in Zustand state. They reset on page reload. For persistent thumbnails, add a `thumbnail` column to `Board` and POST to server on capture.
- **Redis required for rooms**: Without Redis the server starts but room persistence is disabled (join/leave still works in-session, lost on disconnect).
- **No public share links yet**: `guest_view_links` feature is gated but not yet implemented end-to-end (no `shareToken` column on boards).
- **Team membership manual**: There is no invite flow UI. `TeamMembership` rows must be created directly in the DB.
- **PWA offline**: Service worker caches the shell but all board data requires the server. Offline editing is not supported.
- **Single-region deployment**: No CDN for canvas assets. For global latency, front the Railway frontend service with Cloudflare.
