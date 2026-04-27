import type { Viewport } from '../types';

interface TrackedCursor {
  x: number;
  y: number;
  color: string;
  name: string;
  lastSeen: number;
  trail: Array<{ x: number; y: number }>;
}

const TRAIL_LENGTH = 5;
const CURSOR_LIFETIME = 4000; // ms before cursor fully disappears
const FADE_START = 2000; // ms of inactivity before fading begins

export class OverlayEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;
  private rafId: number | null = null;

  private cursors = new Map<string, TrackedCursor>();
  private viewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Overlay canvas 2D context unavailable');
    this.ctx = ctx;
    this.startLoop();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  setViewport(viewport: Viewport): void {
    this.viewport = viewport;
  }

  updateCursor(userId: string, x: number, y: number, color: string, name: string): void {
    const existing = this.cursors.get(userId);
    if (existing) {
      existing.trail.unshift({ x: existing.x, y: existing.y });
      if (existing.trail.length > TRAIL_LENGTH) existing.trail.pop();
      existing.x = x;
      existing.y = y;
      existing.lastSeen = Date.now();
    } else {
      this.cursors.set(userId, { x, y, color, name, lastSeen: Date.now(), trail: [] });
    }
  }

  removeUser(userId: string): void {
    this.cursors.delete(userId);
  }

  handleResize(cssWidth: number, cssHeight: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.width = cssWidth * this.dpr;
    this.canvas.height = cssHeight * this.dpr;
  }

  // ─── Render loop ─────────────────────────────────────────────────────────

  private startLoop(): void {
    const tick = () => {
      this.render();
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private render(): void {
    const { ctx, dpr, cssWidth, cssHeight, viewport } = this;
    if (cssWidth === 0 || cssHeight === 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const now = Date.now();

    for (const [, cursor] of this.cursors) {
      const age = now - cursor.lastSeen;
      if (age > CURSOR_LIFETIME) continue;

      const alpha = age < FADE_START
        ? 1
        : 1 - (age - FADE_START) / (CURSOR_LIFETIME - FADE_START);

      const sx = cursor.x * viewport.zoom + viewport.offsetX;
      const sy = cursor.y * viewport.zoom + viewport.offsetY;

      // Trail dots
      cursor.trail.forEach((pt, i) => {
        const trailAlpha = alpha * (1 - (i + 1) / (TRAIL_LENGTH + 1)) * 0.5;
        if (trailAlpha <= 0) return;
        const tx = pt.x * viewport.zoom + viewport.offsetX;
        const ty = pt.y * viewport.zoom + viewport.offsetY;
        ctx.globalAlpha = trailAlpha;
        ctx.fillStyle = cursor.color;
        ctx.beginPath();
        ctx.arc(tx, ty, 4 - i * 0.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Cursor dot
      ctx.globalAlpha = alpha;
      ctx.fillStyle = cursor.color;
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.fill();

      // Cursor ring
      ctx.globalAlpha = alpha * 0.4;
      ctx.strokeStyle = cursor.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 9, 0, Math.PI * 2);
      ctx.stroke();

      // Name label
      ctx.globalAlpha = alpha;
      ctx.font = '11px Inter, sans-serif';
      const label = cursor.name;
      const labelW = ctx.measureText(label).width + 10;
      const labelX = sx + 12;
      const labelY = sy + 14;

      ctx.fillStyle = cursor.color + '22';
      ctx.beginPath();
      ctx.roundRect(labelX - 4, labelY - 11, labelW, 16, 4);
      ctx.fill();

      ctx.fillStyle = cursor.color;
      ctx.fillText(label, labelX, labelY);
    }

    ctx.globalAlpha = 1;
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
