# Specter — Deploy Checklist

## 1. Paddle Setup

1. Create account → [paddle.com](https://paddle.com) → use **sandbox** first
2. **Catalog → Products** → create two products:
   - "Specter Pro" → add price: $12/month recurring → copy **Price ID** → `PADDLE_PRO_PRICE_ID`
   - "Specter Team" → add price: $39/month recurring → copy **Price ID** → `PADDLE_TEAM_PRICE_ID`
3. **Developer → Authentication** → copy API key → `PADDLE_API_KEY`
4. **Developer → Client-side tokens** → copy token → `VITE_PADDLE_CLIENT_TOKEN`
5. Webhook: skip for now, come back after Railway URL is known (step 3.7)

---

## 2. Railway — Server

1. [railway.app](https://railway.app) → **New Project → Deploy from GitHub** → select `Spectre`
2. Service settings → **Root Directory**: `server`
3. Add plugins: **+ → Database → PostgreSQL** and **+ → Database → Redis**
   - Railway auto-injects `DATABASE_URL` and `REDIS_URL`
4. **Variables** tab → add all of these:

```
NODE_ENV=production
JWT_SECRET=<random 64-char string>
JWT_REFRESH_SECRET=<random 64-char string>
ANTHROPIC_API_KEY=<your key>
PADDLE_API_KEY=<from step 1.3>
PADDLE_WEBHOOK_SECRET=<come back after step 2.7>
PADDLE_PRO_PRICE_ID=<from step 1.2>
PADDLE_TEAM_PRICE_ID=<from step 1.2>
CLIENT_URL=<your frontend URL — add after deploying frontend>
```

5. **Deploy** → wait for build to succeed
6. Copy your Railway server URL (e.g. `https://spectre-server.up.railway.app`)
7. **Run Prisma migrations** → Railway service → **Shell** tab:
   ```bash
   npx prisma migrate deploy
   ```
8. **Register Paddle webhook**:
   - Paddle dashboard → **Notifications → New notification**
   - URL: `https://your-railway-url.up.railway.app/api/billing/webhook`
   - Events to subscribe:
     - `subscription.activated`
     - `subscription.updated`
     - `subscription.canceled`
     - `transaction.payment_failed`
   - Copy **secret key** → go back to Railway → set `PADDLE_WEBHOOK_SECRET=<secret>`
   - Redeploy (or Railway auto-redeploys on var change)

---

## 3. Frontend (Vercel — recommended)

1. [vercel.com](https://vercel.com) → **New Project → Import Git** → select `Spectre`
2. Root directory: `/` (default)
3. Build command: `npm run build` — Output: `dist`
4. **Environment Variables**:

```
VITE_SERVER_URL=https://your-railway-url.up.railway.app
VITE_PADDLE_CLIENT_TOKEN=<from step 1.4>
VITE_PADDLE_ENV=sandbox
```

5. **Deploy** → copy Vercel URL (e.g. `https://spectre.vercel.app`)
6. Go back to Railway → update `CLIENT_URL=https://spectre.vercel.app` → redeploy

---

## 4. Smoke Test

- [ ] Register an account
- [ ] Create a board, draw something
- [ ] Open Pricing page → click Upgrade to Pro → Paddle overlay appears
- [ ] Use Paddle test card: `4242 4242 4242 4242` / any future expiry / any CVC
- [ ] Checkout completes → plan updates to PRO within ~5s
- [ ] AI draws work up to 20/day limit
- [ ] Billing portal loads from Account page

---

## 5. Go Live (when ready)

1. Paddle dashboard → toggle **Sandbox → Production**
2. Get new production API key, price IDs, client token
3. Update Railway + Vercel env vars to production values
4. Set `VITE_PADDLE_ENV=production`
5. Register new webhook for production Paddle endpoint
