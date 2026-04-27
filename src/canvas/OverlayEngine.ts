import type { RemoteUser } from '../types';

// Owns the cursor overlay canvas — renders remote cursors independently
// without triggering a main canvas redraw.
// Phase 3: full implementation with cursor trail effect.
export class OverlayEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private rafId: number | null = null;
  private isDirty = false;
  private users: RemoteUser[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Overlay canvas 2D context unavailable');
    this.ctx = ctx;
  }

  setUsers(users: RemoteUser[]): void {
    this.users = users;
    this.isDirty = true;
  }

  handleResize(cssWidth: number, cssHeight: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = cssWidth * this.dpr;
    this.canvas.height = cssHeight * this.dpr;
    this.isDirty = true;
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }
}
