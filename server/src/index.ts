import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RedisService } from './services/redisService';
import { registerRoomHandler } from './socket/roomHandler';
import aiRouter from './routes/ai';

dotenv.config();

const PORT = process.env.PORT ?? 3001;
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

if (!process.env.CLIENT_URL) {
  console.warn('[warn] CLIENT_URL not set — defaulting to localhost. Set it in production.');
}

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
  // Cap individual Socket.io message size to 512 KB
  maxHttpBufferSize: 512 * 1024,
});

// ─── Security headers ─────────────────────────────────────────────────────────

app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use(cors({ origin: CLIENT_URL }));

// ─── Body parsing — tight global limit, AI route gets its own larger limit ───

app.use(express.json({ limit: '100kb' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

// AI route overrides body limit to 5 MB (base64 canvas screenshots)
app.use('/api/ai', express.json({ limit: '5mb' }), aiRouter);

// app.use('/api/auth', authRouter);
// app.use('/api/boards', boardsRouter);

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

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('[socket] connected:', socket.id);
  registerRoomHandler(io, socket, redis);
});

httpServer.listen(PORT, () => {
  console.log(`Specter server running on :${PORT}`);
});
