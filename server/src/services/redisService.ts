import Redis from 'ioredis';

const ROOM_TTL = 60 * 60 * 48;

export interface RoomUser {
  id: string;
  socketId: string;
  username: string;
  color: string;
  cursor?: { x: number; y: number };
}

export class RedisService {
  private client: Redis;

  constructor(url = process.env.REDIS_URL ?? 'redis://localhost:6379') {
    this.client = new Redis(url, { lazyConnect: true });
    this.client.on('error', (err) => console.error('[redis]', err.message));
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  // ─── Room CRUD ──────────────────────────────────────────────────────────────

  async roomExists(roomId: string): Promise<boolean> {
    return (await this.client.exists(`room:${roomId}`)) === 1;
  }

  async createRoom(roomId: string, hostSocketId: string, hostUserId?: string): Promise<void> {
    const pipe = this.client.pipeline();
    pipe.hset(`room:${roomId}`, { hostSocketId, createdAt: Date.now(), ...(hostUserId ? { hostUserId } : {}) });
    pipe.expire(`room:${roomId}`, ROOM_TTL);
    await pipe.exec();
  }

  async getRoomHostUserId(roomId: string): Promise<string | null> {
    return this.client.hget(`room:${roomId}`, 'hostUserId');
  }

  async refreshRoomTTL(roomId: string): Promise<void> {
    await this.client
      .pipeline()
      .expire(`room:${roomId}`, ROOM_TTL)
      .expire(`room:${roomId}:elements`, ROOM_TTL)
      .expire(`room:${roomId}:users`, ROOM_TTL)
      .exec();
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.client.del(
      `room:${roomId}`,
      `room:${roomId}:elements`,
      `room:${roomId}:users`
    );
  }

  // ─── Socket → Room mapping ──────────────────────────────────────────────────

  async setSocketRoom(socketId: string, roomId: string): Promise<void> {
    await this.client.set(`socket:${socketId}:room`, roomId, 'EX', ROOM_TTL);
  }

  async getSocketRoomId(socketId: string): Promise<string | null> {
    return this.client.get(`socket:${socketId}:room`);
  }

  async clearSocketRoom(socketId: string): Promise<void> {
    await this.client.del(`socket:${socketId}:room`);
  }

  // ─── Users ──────────────────────────────────────────────────────────────────

  async addUserToRoom(roomId: string, socketId: string, user: RoomUser): Promise<void> {
    const pipe = this.client.pipeline();
    pipe.hset(`room:${roomId}:users`, socketId, JSON.stringify(user));
    pipe.expire(`room:${roomId}:users`, ROOM_TTL);
    await pipe.exec();
  }

  async removeUserFromRoom(roomId: string, socketId: string): Promise<void> {
    await this.client.hdel(`room:${roomId}:users`, socketId);
  }

  async getRoomUsers(roomId: string): Promise<RoomUser[]> {
    const raw = await this.client.hgetall(`room:${roomId}:users`);
    if (!raw) return [];
    return Object.values(raw).map((v) => JSON.parse(v) as RoomUser);
  }

  // ─── Elements ───────────────────────────────────────────────────────────────

  async setElement(roomId: string, elementId: string, element: unknown): Promise<void> {
    const pipe = this.client.pipeline();
    pipe.hset(`room:${roomId}:elements`, elementId, JSON.stringify(element));
    pipe.expire(`room:${roomId}:elements`, ROOM_TTL);
    await pipe.exec();
  }

  async deleteElements(roomId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.client.hdel(`room:${roomId}:elements`, ...ids);
  }

  async getAllElements(roomId: string): Promise<unknown[]> {
    const raw = await this.client.hgetall(`room:${roomId}:elements`);
    if (!raw) return [];
    return Object.values(raw).map((v) => JSON.parse(v));
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
