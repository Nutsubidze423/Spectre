import type { Server, Socket } from 'socket.io';
import type { RedisService, RoomUser } from '../services/redisService';
import { prisma } from '../db/client';
import { LIMITS } from '../routes/billing';
import type { Plan } from '@prisma/client';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_USERS_PER_ROOM = 20;
const MAX_ELEMENTS_PER_ROOM = 2000;
const MAX_PEN_POINTS = 5000;
const MAX_TEXT_LENGTH = 1000;
const MAX_STRING_FIELD = 200;

// Socket-level rate limits (per connection, in-memory)
const RATE_LIMITS: Record<string, { interval: number; max: number }> = {
  'room:create': { interval: 60_000, max: 3 },   // 3 room creates per minute
  'room:join':   { interval: 60_000, max: 5 },   // 5 join attempts per minute
  'element:add': { interval: 10_000, max: 100 },  // 100 elements per 10s
};

// ─── Colour pool ──────────────────────────────────────────────────────────────

const USER_COLORS = [
  '#7c6af7', '#f76a6a', '#6af7c8', '#f7d76a',
  '#6ab8f7', '#f76ad7', '#a0f76a', '#f7a06a',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VALID_ROOM_ID = /^[A-Z0-9]{4,8}$/;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

async function generateUniqueCode(redis: RedisService): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateCode();
    if (!(await redis.roomExists(code))) return code;
  }
  throw new Error('Could not generate unique room code');
}

function sanitiseRoomId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return VALID_ROOM_ID.test(cleaned) ? cleaned : null;
}

async function assignColor(redis: RedisService, roomId: string): Promise<string> {
  const users = await redis.getRoomUsers(roomId);
  const taken = new Set(users.map((u) => u.color));
  return USER_COLORS.find((c) => !taken.has(c)) ?? USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

function isFinite2D(x: unknown, y: unknown): boolean {
  return typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y);
}

function truncate(v: unknown, max: number): string {
  const s = typeof v === 'string' ? v : String(v ?? '');
  return s.slice(0, max);
}

// ─── Per-socket rate limiter ───────────────────────────────────────────────────

function makeRateLimiter() {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return function isAllowed(event: string): boolean {
    const rule = RATE_LIMITS[event];
    if (!rule) return true;
    const now = Date.now();
    const bucket = buckets.get(event);
    if (!bucket || now >= bucket.resetAt) {
      buckets.set(event, { count: 1, resetAt: now + rule.interval });
      return true;
    }
    if (bucket.count >= rule.max) return false;
    bucket.count++;
    return true;
  };
}

// ─── Leave helper ─────────────────────────────────────────────────────────────

async function handleLeave(socket: Socket, redis: RedisService, io: Server): Promise<void> {
  try {
    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;

    await redis.removeUserFromRoom(roomId, socket.id);
    await redis.clearSocketRoom(socket.id);
    socket.leave(roomId);
    io.to(roomId).emit('user:left', { userId: socket.id });

    const remaining = await redis.getRoomUsers(roomId);
    if (remaining.length === 0) await redis.deleteRoom(roomId);
  } catch (err) {
    console.error('[handleLeave]', err);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export function registerRoomHandler(io: Server, socket: Socket, redis: RedisService): void {
  const allow = makeRateLimiter();

  // ─── room:create ────────────────────────────────────────────────────────────

  socket.on('room:create', async () => {
    if (!allow('room:create')) {
      socket.emit('room:error', { message: 'Too many room creates — slow down' });
      return;
    }
    try {
      const roomId = await generateUniqueCode(redis);
      const color = USER_COLORS[0];
      const user: RoomUser = {
        id: socket.id,
        socketId: socket.id,
        username: `User-${socket.id.slice(0, 4).toUpperCase()}`,
        color,
      };

      const hostUserId = socket.data.userId as string | undefined;
      await redis.createRoom(roomId, socket.id, hostUserId);
      await redis.addUserToRoom(roomId, socket.id, user);
      await redis.setSocketRoom(socket.id, roomId);

      socket.join(roomId);
      socket.emit('room:created', { roomId, code: roomId, myUserId: socket.id, myColor: color });
    } catch (err) {
      console.error('[room:create]', err);
      socket.emit('room:error', { message: 'Failed to create room' });
    }
  });

  // ─── room:join ──────────────────────────────────────────────────────────────

  socket.on('room:join', async (payload: unknown) => {
    if (!allow('room:join')) {
      socket.emit('room:error', { message: 'Too many join attempts — slow down' });
      return;
    }
    try {
      const roomId = sanitiseRoomId((payload as Record<string, unknown>)?.roomId);
      if (!roomId) {
        socket.emit('room:error', { message: 'Invalid room code' });
        return;
      }

      const exists = await redis.roomExists(roomId);
      if (!exists) {
        socket.emit('room:error', { message: 'Room not found' });
        return;
      }

      const users = await redis.getRoomUsers(roomId);

      // Plan-based collaborator limit (uses host's plan)
      const hostUserId = await redis.getRoomHostUserId(roomId);
      let collaboratorLimit = MAX_USERS_PER_ROOM;
      let hostPlan: Plan = 'FREE';
      if (hostUserId) {
        const sub = await prisma.subscription.findUnique({
          where: { userId: hostUserId },
          select: { plan: true },
        });
        hostPlan = sub?.plan ?? 'FREE';
        collaboratorLimit = Math.min(LIMITS[hostPlan].collaborators, MAX_USERS_PER_ROOM);
      }

      if (users.length >= collaboratorLimit) {
        socket.emit('room:full', { plan: hostPlan, limit: collaboratorLimit });
        return;
      }

      const color = await assignColor(redis, roomId);
      const user: RoomUser = {
        id: socket.id,
        socketId: socket.id,
        username: `User-${socket.id.slice(0, 4).toUpperCase()}`,
        color,
      };

      await redis.addUserToRoom(roomId, socket.id, user);
      await redis.setSocketRoom(socket.id, roomId);
      await redis.refreshRoomTTL(roomId);

      const [elements, allUsers] = await Promise.all([
        redis.getAllElements(roomId),
        redis.getRoomUsers(roomId),
      ]);

      socket.join(roomId);
      socket.emit('room:joined', {
        roomId,
        code: roomId,
        elements,
        users: allUsers,
        myUserId: socket.id,
        myColor: color,
      });
      socket.to(roomId).emit('user:joined', user);
    } catch (err) {
      console.error('[room:join]', err);
      socket.emit('room:error', { message: 'Failed to join room' });
    }
  });

  // ─── room:leave ─────────────────────────────────────────────────────────────

  socket.on('room:leave', () => handleLeave(socket, redis, io));

  // ─── cursor:move ────────────────────────────────────────────────────────────

  socket.on('cursor:move', async (payload: unknown) => {
    const p = payload as Record<string, unknown>;
    if (!isFinite2D(p?.x, p?.y)) return;
    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit('cursor:moved', { userId: socket.id, x: p.x, y: p.y });
  });

  // ─── stroke:point ───────────────────────────────────────────────────────────

  socket.on('stroke:point', async (payload: unknown) => {
    const p = payload as Record<string, unknown>;
    if (!isFinite2D(p?.x, p?.y)) return;
    if (typeof p?.elementId !== 'string' || p.elementId.length > MAX_STRING_FIELD) return;
    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit('stroke:point', {
      userId: socket.id,
      elementId: p.elementId,
      x: p.x,
      y: p.y,
    });
  });

  // ─── stroke:complete ────────────────────────────────────────────────────────

  socket.on('stroke:complete', async (payload: unknown) => {
    const p = payload as Record<string, unknown>;
    const element = p?.element as Record<string, unknown> | undefined;
    if (!element || typeof element.id !== 'string') return;

    // Cap pen points
    if (Array.isArray(element.points) && element.points.length > MAX_PEN_POINTS) {
      element.points = (element.points as unknown[]).slice(0, MAX_PEN_POINTS);
    }

    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;

    const count = (await redis.getAllElements(roomId)).length;
    if (count >= MAX_ELEMENTS_PER_ROOM) return;

    await redis.setElement(roomId, element.id, element);
    socket.to(roomId).emit('stroke:complete', { userId: socket.id, element });
  });

  // ─── element:add ────────────────────────────────────────────────────────────

  socket.on('element:add', async (payload: unknown) => {
    if (!allow('element:add')) return;

    const p = payload as Record<string, unknown>;
    const element = p?.element as Record<string, unknown> | undefined;
    if (!element || typeof element.id !== 'string') return;

    // Sanitise text
    if (typeof element.text === 'string') {
      element.text = element.text.slice(0, MAX_TEXT_LENGTH);
    }
    // Cap pen points
    if (Array.isArray(element.points) && element.points.length > MAX_PEN_POINTS) {
      element.points = (element.points as unknown[]).slice(0, MAX_PEN_POINTS);
    }

    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;

    const count = (await redis.getAllElements(roomId)).length;
    if (count >= MAX_ELEMENTS_PER_ROOM) {
      socket.emit('room:error', { message: 'Canvas element limit reached' });
      return;
    }

    await redis.setElement(roomId, element.id, element);
    socket.to(roomId).emit('element:added', { element });
  });

  // ─── element:update ─────────────────────────────────────────────────────────

  socket.on('element:update', async (payload: unknown) => {
    const p = payload as Record<string, unknown>;
    if (typeof p?.id !== 'string' || p.id.length > MAX_STRING_FIELD) return;
    const changes = p?.changes as Record<string, unknown> | undefined;
    if (!changes || typeof changes !== 'object') return;

    // Sanitise text in changes
    if (typeof changes.text === 'string') {
      changes.text = changes.text.slice(0, MAX_TEXT_LENGTH);
    }

    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;

    const all = await redis.getAllElements(roomId) as Array<Record<string, unknown>>;
    const existing = all.find((e) => e.id === p.id);
    if (existing) {
      await redis.setElement(roomId, p.id, {
        ...existing,
        ...changes,
        // Prevent overwriting provenance fields
        id: existing.id,
        createdBy: existing.createdBy,
        createdAt: existing.createdAt,
        version: ((existing.version as number) ?? 0) + 1,
      });
    }
    socket.to(roomId).emit('element:updated', { id: p.id, changes });
  });

  // ─── element:delete ─────────────────────────────────────────────────────────

  socket.on('element:delete', async (payload: unknown) => {
    const p = payload as Record<string, unknown>;
    if (!Array.isArray(p?.ids)) return;

    // Cap how many IDs can be deleted at once, validate each is a string
    const ids = (p.ids as unknown[])
      .slice(0, 500)
      .filter((id): id is string => typeof id === 'string' && id.length <= MAX_STRING_FIELD);

    if (ids.length === 0) return;

    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;

    await redis.deleteElements(roomId, ids);
    socket.to(roomId).emit('element:deleted', { ids });
  });

  // ─── disconnect ─────────────────────────────────────────────────────────────

  socket.on('disconnect', () => handleLeave(socket, redis, io));

  // Log suspicious activity — unknown events from this socket
  socket.onAny((event: string) => {
    const known = [
      'room:create', 'room:join', 'room:leave',
      'cursor:move', 'stroke:point', 'stroke:complete',
      'element:add', 'element:update', 'element:delete',
      'disconnect', 'disconnecting',
    ];
    if (!known.includes(event)) {
      console.warn(`[socket] unexpected event "${truncate(event, 64)}" from ${socket.id}`);
    }
  });
}
