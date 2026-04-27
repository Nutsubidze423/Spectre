import type { CanvasElement, RemoteUser } from '../types';

// Manages the Socket.io connection, room events, and remote state sync.
// Phase 3: full implementation.
export class RoomEngine {
  private socketUrl: string;

  constructor(socketUrl: string) {
    this.socketUrl = socketUrl;
  }

  createRoom(): Promise<string> {
    // Phase 3: emit room:create, resolve with roomId
    return Promise.resolve('');
  }

  joinRoom(_roomId: string): Promise<{ elements: CanvasElement[]; users: RemoteUser[] }> {
    // Phase 3: emit room:join, receive room:joined
    return Promise.resolve({ elements: [], users: [] });
  }

  leaveRoom(): void {
    // Phase 3
  }

  emitCursorMove(_x: number, _y: number): void {
    // Phase 3: throttled to 30/sec
  }

  emitStrokePoint(_elementId: string, _point: { x: number; y: number }): void {
    // Phase 3
  }

  emitStrokeComplete(_element: CanvasElement): void {
    // Phase 3
  }

  emitElementAdd(_element: CanvasElement): void {
    // Phase 3
  }

  emitElementUpdate(_id: string, _changes: Partial<CanvasElement>): void {
    // Phase 3
  }

  emitElementDelete(_ids: string[]): void {
    // Phase 3
  }

  destroy(): void {
    // Phase 3: socket.disconnect()
  }
}
