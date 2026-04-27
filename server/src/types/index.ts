// ─── DB models ────────────────────────────────────────────────────────────────

export interface DbUser {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  createdAt: Date;
}

export interface DbBoard {
  id: string;
  userId: string;
  name: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  shareToken: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DbBoardSnapshot {
  id: string;
  boardId: string;
  elementsJson: unknown;
  createdAt: Date;
}

// ─── Redis room models ────────────────────────────────────────────────────────

export interface RedisRoom {
  hostSocketId: string;
  createdAt: number;
  userCount: number;
}

export interface RedisRoomUser {
  userId: string;
  username: string;
  color: string;
  cursor?: { x: number; y: number };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface JwtPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
