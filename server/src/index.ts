import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const PORT = process.env.PORT ?? 3001;
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: CLIENT_URL, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: CLIENT_URL }));
app.use(express.json({ limit: '10mb' })); // base64 canvas snapshots can be large

// Routes (Phase 3-5)
// app.use('/api/auth', authRouter);
// app.use('/api/boards', boardsRouter);
// app.use('/api/ai', aiRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Socket.io (Phase 3)
io.on('connection', (socket) => {
  console.log('client connected:', socket.id);
  socket.on('disconnect', () => console.log('client left:', socket.id));
});

httpServer.listen(PORT, () => {
  console.log(`Specter server running on :${PORT}`);
});
