# Spectre — Step-by-Step Deployment Guide

## What you need before starting

- A [Railway](https://railway.app) account (free tier works to start)
- A [Paddle](https://paddle.com) account (sandbox for testing, production when ready)
- An [Anthropic](https://console.anthropic.com) API key
- Git installed locally
- Node.js 18+ installed locally

---

## Step 1 — Clone and install

```bash
git clone https://github.com/Nutsubidze423/Spectre.git
cd Spectre

# Install frontend deps
npm install

# Install server deps
cd server && npm install && cd ..
```

---

## Step 2 — Set up PostgreSQL locally (for dev)

The easiest way is Docker:

```bash
docker run -d \
  --name spectre-pg \
  -e POSTGRES_USER=spectre \
  -e POSTGRES_PASSWORD=spectre \
  -e POSTGRES_DB=spectre \
  -p 5432:5432 \
  postgres:16
```

Your local `DATABASE_URL`:
```
postgresql://spectre:spectre@localhost:5432/spectre
```

---

## Step 3 — Set up Redis locally (for multiplayer rooms)

```bash
docker run -d --name spectre-redis -p 6379:6379 redis:latest
```

Your local `REDIS_URL`:
```
redis://localhost:6379
```

---

## Step 4 — Set up Paddle

### 4a. Create products and prices

1. Log in to [sandbox.paddle.com](https://sandbox.paddle.com) (use sandbox first)
2. Go to **Catalog → Products** → **New product**
3. Create 3 products: `Spectre Solo`, `Spectre Pro`, `Spectre Team`
4. For each product, go to **Prices** and create a recurring monthly price:
   - Solo: $9/month
   - Pro: $19/month
   - Team: $49/month
5. Copy each **Price ID** (starts with `pri_`) — you'll need them as env vars

### 4b. Get your API key and client token

1. Go to **Developer Tools → Authentication**
2. Copy your **API key** — this is `PADDLE_API_KEY` (server-side, keep secret)
3. Copy your **Client-side token** — this is `VITE_PADDLE_CLIENT_TOKEN` (safe for frontend)

### 4c. Set up webhook

1. Go to **Developer Tools → Notifications → New destination**
2. URL: `https://your-backend-domain.com/api/billing/webhook`
   - For local testing use [ngrok](https://ngrok.com): `ngrok http 3001` then use the HTTPS URL
3. Select these events:
   - `subscription.activated`
   - `subscription.updated`
   - `subscription.canceled`
   - `transaction.payment_failed`
4. Copy the **secret key** — this is `PADDLE_WEBHOOK_SECRET`

---

## Step 5 — Create environment files

### `server/.env`

```env
NODE_ENV=development
PORT=3001
CLIENT_URL=http://localhost:5173

DATABASE_URL=postgresql://spectre:spectre@localhost:5432/spectre
REDIS_URL=redis://localhost:6379

JWT_SECRET=<generate: openssl rand -hex 32>
JWT_REFRESH_SECRET=<generate: openssl rand -hex 32>

ANTHROPIC_API_KEY=sk-ant-...

PADDLE_API_KEY=<your Paddle API key>
PADDLE_WEBHOOK_SECRET=<your Paddle webhook secret>
PADDLE_SOLO_PRICE_ID=pri_...
PADDLE_PRO_PRICE_ID=pri_...
PADDLE_TEAM_PRICE_ID=pri_...
```

### `.env` (frontend root, create this file)

```env
VITE_PADDLE_CLIENT_TOKEN=<your Paddle client-side token>
VITE_PADDLE_ENV=sandbox
```

When going to production change `VITE_PADDLE_ENV=production`.

---

## Step 6 — Run database migrations

```bash
cd server
npx prisma migrate deploy
```

This runs all migrations in `server/prisma/migrations/` in order. The schema creates all tables: users, boards, subscriptions, usage tracking, etc.

To also generate the Prisma client (needed after any schema change):

```bash
npx prisma generate
```

---

## Step 7 — Run locally

Open 3 terminals:

**Terminal 1 — backend:**
```bash
cd server
npm run dev
# Server runs on http://localhost:3001
```

**Terminal 2 — frontend:**
```bash
npm run dev
# App runs on http://localhost:5173
```

**Terminal 3 — ngrok (only needed to test Paddle webhooks locally):**
```bash
ngrok http 3001
# Copy the HTTPS URL and set it as your Paddle webhook destination
```

Open [http://localhost:5173](http://localhost:5173) — you should see the Spectre login screen.

---

## Step 8 — Deploy to Railway

### 8a. Create Railway project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Choose **Deploy from GitHub repo** → select `Spectre`
3. Railway will auto-detect it as a Node.js app

### 8b. Add PostgreSQL and Redis

In your Railway project:
1. Click **+ New** → **Database** → **Add PostgreSQL**
2. Click **+ New** → **Database** → **Add Redis**

Railway will automatically create `DATABASE_URL` and `REDIS_URL` variables — copy them for the next step.

### 8c. Create two Railway services

Railway may auto-create one service. You need two:

**Service 1 — server:**

Set these in the service settings:
- **Root directory:** `server`
- **Build command:** `npm install && npx prisma generate && npm run build`
- **Start command:** `node dist/index.js`

Add environment variables (click **Variables** tab):
```
NODE_ENV=production
PORT=3001
CLIENT_URL=https://<your-frontend-railway-domain>
DATABASE_URL=<from Railway PostgreSQL>
REDIS_URL=<from Railway Redis>
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
ANTHROPIC_API_KEY=sk-ant-...
PADDLE_API_KEY=<your Paddle PRODUCTION API key>
PADDLE_WEBHOOK_SECRET=<your Paddle webhook secret>
PADDLE_SOLO_PRICE_ID=pri_...
PADDLE_PRO_PRICE_ID=pri_...
PADDLE_TEAM_PRICE_ID=pri_...
```

**Service 2 — frontend:**

- **Root directory:** `/` (project root)
- **Build command:** `npm install && npm run build`
- **Start command:** `npx serve dist -s -l 8080`

Add environment variables:
```
VITE_PADDLE_CLIENT_TOKEN=<your Paddle PRODUCTION client token>
VITE_PADDLE_ENV=production
```

> **Important:** The frontend build bakes env vars at build time. If you change `VITE_*` vars you must redeploy.

### 8d. Run migrations on production

After the server service first deploys:

1. In Railway → server service → **Settings** → **Deploy** section
2. Run a one-off command: `npx prisma migrate deploy`

Or do it locally with the production DATABASE_URL:
```bash
DATABASE_URL="<production db url>" npx prisma migrate deploy
```

### 8e. Update Paddle webhook URL

Go back to your Paddle dashboard → Developer Tools → Notifications → edit your webhook destination and replace the ngrok URL with:

```
https://<your-server-railway-domain>/api/billing/webhook
```

---

## Step 9 — Switch Paddle from sandbox to production

When you're ready to accept real payments:

1. Log in to [paddle.com](https://paddle.com) (production, not sandbox)
2. Repeat Step 4 — create products, prices, webhook, get API key and client token
3. Update your Railway server env vars:
   - `PADDLE_API_KEY` → production key
   - `PADDLE_WEBHOOK_SECRET` → production webhook secret
   - `PADDLE_SOLO_PRICE_ID`, `PADDLE_PRO_PRICE_ID`, `PADDLE_TEAM_PRICE_ID` → production price IDs
4. Update Railway frontend env vars:
   - `VITE_PADDLE_CLIENT_TOKEN` → production client token
   - `VITE_PADDLE_ENV` → `production`
5. Redeploy both services

---

## Step 10 — Verify everything works

Go through this checklist:

- [ ] Can register a new account
- [ ] Can create and save a board
- [ ] Can use AI draw (select region → drag → type prompt → generate)
- [ ] Can use Thinking Partner (toolbar → microphone icon)
- [ ] Pricing page loads and shows 4 plans
- [ ] Clicking "Upgrade to Solo" opens Paddle checkout overlay (sandbox)
- [ ] After test purchase, plan updates in Account page
- [ ] Manage Billing button opens Paddle customer portal
- [ ] Multiplayer works: open two tabs, create a room, join from other tab
- [ ] Canvas auto-saves every 30 seconds

---

## Environment variable reference

| Variable | Where | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | server | Yes | PostgreSQL connection string |
| `REDIS_URL` | server | Yes* | Redis connection (*rooms disabled without it) |
| `JWT_SECRET` | server | Yes | 32+ char random secret for access tokens |
| `JWT_REFRESH_SECRET` | server | Yes | 32+ char random secret for refresh tokens |
| `ANTHROPIC_API_KEY` | server | Yes | Anthropic API key for AI features |
| `PADDLE_API_KEY` | server | Yes | Paddle server-side API key |
| `PADDLE_WEBHOOK_SECRET` | server | Yes | Paddle webhook signing secret |
| `PADDLE_SOLO_PRICE_ID` | server | Yes | Paddle price ID for Solo plan |
| `PADDLE_PRO_PRICE_ID` | server | Yes | Paddle price ID for Pro plan |
| `PADDLE_TEAM_PRICE_ID` | server | Yes | Paddle price ID for Team plan |
| `CLIENT_URL` | server | Yes | Frontend URL (for CORS + redirects) |
| `NODE_ENV` | server | Yes | `development` or `production` |
| `PORT` | server | No | Default: 3001 |
| `VITE_PADDLE_CLIENT_TOKEN` | frontend | Yes | Paddle client-side token (safe to expose) |
| `VITE_PADDLE_ENV` | frontend | No | `sandbox` (default) or `production` |

---

## Troubleshooting

**"PADDLE_API_KEY not configured" in server logs**
→ Add `PADDLE_API_KEY` to your server env vars and restart.

**Checkout overlay doesn't open**
→ Check browser console for Paddle errors. Likely `VITE_PADDLE_CLIENT_TOKEN` is missing or wrong environment. Make sure `VITE_PADDLE_ENV=sandbox` when using sandbox price IDs.

**Webhook not received / plan not updating after purchase**
→ Check Paddle dashboard → Notifications → your destination → **Logs** tab. Verify the URL is correct and returns 200. If testing locally, confirm ngrok is running and the URL is current (ngrok URLs change each restart).

**"No billing account found" on Manage Billing**
→ The user has no Paddle subscription linked. This happens if the webhook wasn't received for their purchase. Check webhook logs in Paddle dashboard.

**Prisma migration fails on deploy**
→ Make sure `DATABASE_URL` is set before running `prisma migrate deploy`. Run `prisma generate` after any schema change.

**Rooms not working / users can't see each other**
→ Redis is not connected. Check `REDIS_URL` is set. Server logs will say `[redis] not reachable` if it can't connect.

**CORS errors in browser**
→ `CLIENT_URL` on the server doesn't match the actual frontend URL (including protocol and port). Must be exact match, no trailing slash.
