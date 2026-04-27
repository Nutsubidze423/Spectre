import type { Server, Socket } from 'socket.io';
import type { RedisService, RoomUser } from '../services/redisService';

const USER_COLORS = [
  '#7c6af7', '#f76a6a', '#6af7c8', '#f7d76a',
  '#6ab8f7', '#f76ad7', '#a0f76a', '#f7a06a',
];

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

async function generateUniqueCode(redis: RedisService): Promise<string> {
  let attempts = 0;
  while (attempts < 10) {
    const code = generateCode();
    if (!(await redis.roomExists(code))) return code;
    attempts++;
  }
  throw new Error('Could not generate unique room code');
}

async function assignColor(redis: RedisService, roomId: string): Promise<string> {
  const users = await redis.getRoomUsers(roomId);
  const taken = new Set(users.map((u) => u.color));
  return USER_COLORS.find((c) => !taken.has(c)) ?? USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
}

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

export function registerRoomHandler(io: Server, socket: Socket, redis: RedisService): void {
  // ─── room:create ────────────────────────────────────────────────────────────

  socket.on('room:create', async () => {
    try {
      const roomId = await generateUniqueCode(redis);
      const color = USER_COLORS[0];
      const user: RoomUser = {
        id: socket.id,
        socketId: socket.id,
        username: `User-${socket.id.slice(0, 4).toUpperCase()}`,
        color,
      };

      await redis.createRoom(roomId, socket.id);
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

  socket.on('room:join', async ({ roomId }: { roomId: string }) => {
    try {
      const normalised = roomId.trim().toUpperCase();
      const exists = await redis.roomExists(normalised);
      if (!exists) {
        socket.emit('room:error', { message: 'Room not found' });
        return;
      }

      const color = await assignColor(redis, normalised);
      const user: RoomUser = {
        id: socket.id,
        socketId: socket.id,
        username: `User-${socket.id.slice(0, 4).toUpperCase()}`,
        color,
      };

      await redis.addUserToRoom(normalised, socket.id, user);
      await redis.setSocketRoom(socket.id, normalised);
      await redis.refreshRoomTTL(normalised);

      const [elements, users] = await Promise.all([
        redis.getAllElements(normalised),
        redis.getRoomUsers(normalised),
      ]);

      socket.join(normalised);
      socket.emit('room:joined', {
        roomId: normalised,
        code: normalised,
        elements,
        users,
        myUserId: socket.id,
        myColor: color,
      });
      socket.to(normalised).emit('user:joined', user);
    } catch (err) {
      console.error('[room:join]', err);
      socket.emit('room:error', { message: 'Failed to join room' });
    }
  });

  // ─── room:leave ─────────────────────────────────────────────────────────────

  socket.on('room:leave', () => handleLeave(socket, redis, io));

  // ─── cursor:move ────────────────────────────────────────────────────────────

  socket.on('cursor:move', async ({ x, y }: { x: number; y: number }) => {
    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit('cursor:moved', { userId: socket.id, x, y });
  });

  // ─── stroke:point ───────────────────────────────────────────────────────────

  socket.on('stroke:point', async ({ elementId, x, y }: { elementId: string; x: number; y: number }) => {
    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;
    socket.to(roomId).emit('stroke:point', { userId: socket.id, elementId, x, y });
  });

  // ─── stroke:complete ────────────────────────────────────────────────────────

  socket.on('stroke:complete', async ({ element }: { element: Record<string, unknown> }) => {
    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;
    await redis.setElement(roomId, element.id as string, element);
    socket.to(roomId).emit('stroke:complete', { userId: socket.id, element });
  });

  // ─── element:add ────────────────────────────────────────────────────────────

  socket.on('element:add', async ({ element }: { element: Record<string, unknown> }) => {
    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;
    await redis.setElement(roomId, element.id as string, element);
    socket.to(roomId).emit('element:added', { element });
  });

  // ─── element:update ─────────────────────────────────────────────────────────

  socket.on('element:update', async ({ id, changes }: { id: string; changes: Record<string, unknown> }) => {
    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;
    // Merge into stored element
    const all = await redis.getAllElements(roomId) as Array<Record<string, unknown>>;
    const existing = all.find((e) => e.id === id);
    if (existing) {
      await redis.setElement(roomId, id, {
        ...existing,
        ...changes,
        version: ((existing.version as number) ?? 0) + 1,
      });
    }
    socket.to(roomId).emit('element:updated', { id, changes });
  });

  // ─── element:delete ─────────────────────────────────────────────────────────

  socket.on('element:delete', async ({ ids }: { ids: string[] }) => {
    const roomId = await redis.getSocketRoomId(socket.id);
    if (!roomId) return;
    await redis.deleteElements(roomId, ids);
    socket.to(roomId).emit('element:deleted', { ids });
  });

  // ─── disconnect ─────────────────────────────────────────────────────────────

  socket.on('disconnect', () => handleLeave(socket, redis, io));
}
