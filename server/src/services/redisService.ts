import Redis from 'ioredis';

const ROOM_TTL = 60 * 60 * 48; // 48 hours in seconds

// Phase 3: full Redis room state management.
export class RedisService {
  private client: Redis;

  constructor(url = process.env.REDIS_URL ?? 'redis://localhost:6379') {
    this.client = new Redis(url, { lazyConnect: true });
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  // Room methods (Phase 3)
  async roomExists(_roomId: string): Promise<boolean> { return false; }
  async createRoom(_roomId: string, _hostSocketId: string): Promise<void> {}
  async refreshRoomTTL(_roomId: string): Promise<void> {}
  async deleteRoom(_roomId: string): Promise<void> {}
  async addUserToRoom(_roomId: string, _socketId: string, _user: unknown): Promise<void> {}
  async removeUserFromRoom(_roomId: string, _socketId: string): Promise<void> {}
  async getRoomUsers(_roomId: string): Promise<unknown[]> { return []; }
  async setElement(_roomId: string, _elementId: string, _element: unknown): Promise<void> {}
  async deleteElements(_roomId: string, _ids: string[]): Promise<void> {}
  async getAllElements(_roomId: string): Promise<unknown[]> { return []; }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
