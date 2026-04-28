import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RedisService } from './services/redisService';
import { registerRoomHandler } from './socket/roomHandler';
import aiRouter from './routes/ai';
import authRouter from './routes/auth';
import boardsRouter from './routes/boards';
import billingRouter, { webhookHandler } from './routes/billing';
import { requireAuth } from './middleware/auth';
import { checkAIAccess } from './middleware/checkAIAccess';
import { checkBoardLimit } from './middleware/checkBoardLimit';
import type { JwtPayload } from './types/index';

dotenv.config();

const PORT = process.env.PORT ?? 3001;
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

if (!process.env.CLIENT_URL) {
  console.warn('[warn] CLIENT_URL not set — defaulting to localhost. Set it in production.');
}
if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.warn('[warn] JWT_SECRET / JWT_REFRESH_SECRET not set — auth will fail.');
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[warn] STRIPE_SECRET_KEY not set — billing will fail.');
}

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
  maxHttpBufferSize: 512 * 1024,
});

// ─── Security headers ─────────────────────────────────────────────────────────

app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use(cors({ origin: CLIENT_URL, credentials: true }));

// ─── Cookie parser ────────────────────────────────────────────────────────────

app.use(cookieParser());

// ─── Stripe webhook — raw body BEFORE express.json() ─────────────────────────

app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), webhookHandler);

// ─── Body parsing ─────────────────────────────────────────────────────────────

app.use(express.json({ limit: '100kb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);

// POST /api/boards: run plan-based board limit check before the router
app.post('/api/boards', requireAuth, checkBoardLimit, (_req, _res, next) => next());
app.use('/api/boards', boardsRouter);

// AI draw: require auth + plan-based usage check
app.post('/api/ai/draw', requireAuth, checkAIAccess, (_req, _res, next) => next());
app.use('/api/ai', express.json({ limit: '5mb' }), aiRouter);

app.use('/api/billing', billingRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ─── Redis ────────────────────────────────────────────────────────────────────

const redis = new RedisService();

redis.ping().then((ok) => {
  if (ok) {
    console.log('[redis] connected');
  } else {
    console.warn('[redis] not reachable — room persistence disabled');
  }
});

// ─── Socket.io — extract userId from JWT handshake (anonymous connections ok) ─

io.use((socket, next) => {
  const token = socket.handshake.auth?.token as string | undefined;
  if (token && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET) as JwtPayload;
      socket.data.userId = payload.userId;
    } catch {
      // Invalid token — treat as anonymous
    }
  }
  next();
});

io.on('connection', (socket) => {
  console.log('[socket] connected:', socket.id, socket.data.userId ? `(user: ${socket.data.userId as string})` : '(anon)');
  registerRoomHandler(io, socket, redis);
});

httpServer.listen(PORT, () => {
  console.log(`Specter server running on :${PORT}`);
});
