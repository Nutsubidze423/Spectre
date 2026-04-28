import { io, type Socket } from 'socket.io-client';
import type { CanvasElement, RemoteUser } from '../types';
import { useAuthStore } from '../store/authStore';

let _instance: RoomEngine | null = null;
export function getRoomEngine(): RoomEngine | null { return _instance; }
export function setRoomEngine(re: RoomEngine | null): void { _instance = re; }

export interface RoomCreatedData {
  roomId: string;
  code: string;
  myUserId: string;
  myColor: string;
}

export interface RoomJoinedData {
  roomId: string;
  code: string;
  elements: CanvasElement[];
  users: RemoteUser[];
  myUserId: string;
  myColor: string;
}

export class RoomEngine {
  private socket: Socket;
  private lastCursorEmit = 0;
  private readonly CURSOR_INTERVAL = 1000 / 30; // 30fps

  // ─── Callbacks ───────────────────────────────────────────────────────────────

  private _onConnected?: () => void;
  private _onDisconnected?: () => void;
  private _onRoomCreated?: (data: RoomCreatedData) => void;
  private _onRoomJoined?: (data: RoomJoinedData) => void;
  private _onRoomError?: (data: { message: string }) => void;
  private _onUserJoined?: (user: RemoteUser) => void;
  private _onUserLeft?: (data: { userId: string }) => void;
  private _onCursorMoved?: (data: { userId: string; x: number; y: number }) => void;
  private _onStrokePoint?: (data: { userId: string; elementId: string; x: number; y: number }) => void;
  private _onStrokeComplete?: (data: { userId: string; element: CanvasElement }) => void;
  private _onElementAdded?: (data: { element: CanvasElement }) => void;
  private _onElementUpdated?: (data: { id: string; changes: Partial<CanvasElement> }) => void;
  private _onElementDeleted?: (data: { ids: string[] }) => void;
  private _onRoomFull?: (data: { plan: string; limit: number }) => void;

  constructor(url: string) {
    const token = useAuthStore.getState().accessToken;
    this.socket = io(url, {
      autoConnect: false,
      auth: token ? { token } : {},
    });
    this.setupListeners();
  }

  private setupListeners(): void {
    this.socket.on('connect', () => this._onConnected?.());
    this.socket.on('disconnect', () => this._onDisconnected?.());
    this.socket.on('room:created', (d) => this._onRoomCreated?.(d));
    this.socket.on('room:joined', (d) => this._onRoomJoined?.(d));
    this.socket.on('room:error', (d) => this._onRoomError?.(d));
    this.socket.on('user:joined', (d) => this._onUserJoined?.(d));
    this.socket.on('user:left', (d) => this._onUserLeft?.(d));
    this.socket.on('cursor:moved', (d) => this._onCursorMoved?.(d));
    this.socket.on('stroke:point', (d) => this._onStrokePoint?.(d));
    this.socket.on('stroke:complete', (d) => this._onStrokeComplete?.(d));
    this.socket.on('element:added', (d) => this._onElementAdded?.(d));
    this.socket.on('element:updated', (d) => this._onElementUpdated?.(d));
    this.socket.on('element:deleted', (d) => this._onElementDeleted?.(d));
    this.socket.on('room:full', (d) => this._onRoomFull?.(d));
  }

  // ─── Connection ───────────────────────────────────────────────────────────

  private ensureConnected(): void {
    if (!this.socket.connected) this.socket.connect();
  }

  get isConnected(): boolean { return this.socket.connected; }

  // ─── Room actions ─────────────────────────────────────────────────────────

  createRoom(): void {
    this.ensureConnected();
    this.socket.once('connect', () => this.socket.emit('room:create'));
    if (this.socket.connected) this.socket.emit('room:create');
  }

  joinRoom(code: string): void {
    this.ensureConnected();
    const emit = () => this.socket.emit('room:join', { roomId: code.trim().toUpperCase() });
    if (this.socket.connected) emit();
    else this.socket.once('connect', emit);
  }

  leaveRoom(): void {
    if (this.socket.connected) this.socket.emit('room:leave');
  }

  // ─── Emit helpers ─────────────────────────────────────────────────────────

  emitCursorMove(x: number, y: number): void {
    const now = Date.now();
    if (now - this.lastCursorEmit < this.CURSOR_INTERVAL) return;
    this.lastCursorEmit = now;
    if (this.socket.connected) this.socket.emit('cursor:move', { x, y });
  }

  emitStrokePoint(elementId: string, x: number, y: number): void {
    if (this.socket.connected) this.socket.emit('stroke:point', { elementId, x, y });
  }

  emitStrokeComplete(element: CanvasElement): void {
    if (this.socket.connected) this.socket.emit('stroke:complete', { element });
  }

  emitElementAdd(element: CanvasElement): void {
    if (this.socket.connected) this.socket.emit('element:add', { element });
  }

  emitElementUpdate(id: string, changes: Partial<CanvasElement>): void {
    if (this.socket.connected) this.socket.emit('element:update', { id, changes });
  }

  emitElementDelete(ids: string[]): void {
    if (this.socket.connected) this.socket.emit('element:delete', { ids });
  }

  // ─── Callback setters ─────────────────────────────────────────────────────

  onConnected(cb: () => void): this { this._onConnected = cb; return this; }
  onDisconnected(cb: () => void): this { this._onDisconnected = cb; return this; }
  onRoomCreated(cb: (d: RoomCreatedData) => void): this { this._onRoomCreated = cb; return this; }
  onRoomJoined(cb: (d: RoomJoinedData) => void): this { this._onRoomJoined = cb; return this; }
  onRoomError(cb: (d: { message: string }) => void): this { this._onRoomError = cb; return this; }
  onUserJoined(cb: (user: RemoteUser) => void): this { this._onUserJoined = cb; return this; }
  onUserLeft(cb: (d: { userId: string }) => void): this { this._onUserLeft = cb; return this; }
  onCursorMoved(cb: (d: { userId: string; x: number; y: number }) => void): this { this._onCursorMoved = cb; return this; }
  onStrokePoint(cb: (d: { userId: string; elementId: string; x: number; y: number }) => void): this { this._onStrokePoint = cb; return this; }
  onStrokeComplete(cb: (d: { userId: string; element: CanvasElement }) => void): this { this._onStrokeComplete = cb; return this; }
  onElementAdded(cb: (d: { element: CanvasElement }) => void): this { this._onElementAdded = cb; return this; }
  onElementUpdated(cb: (d: { id: string; changes: Partial<CanvasElement> }) => void): this { this._onElementUpdated = cb; return this; }
  onElementDeleted(cb: (d: { ids: string[] }) => void): this { this._onElementDeleted = cb; return this; }
  onRoomFull(cb: (d: { plan: string; limit: number }) => void): this { this._onRoomFull = cb; return this; }

  destroy(): void {
    this.socket.disconnect();
  }
}
