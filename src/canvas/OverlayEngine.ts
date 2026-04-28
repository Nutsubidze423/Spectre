import type { Viewport } from '../types';

interface TrackedCursor {
  x: number;
  y: number;
  color: string;
  name: string;
  lastSeen: number;
  trail: Array<{ x: number; y: number }>;
}

interface ActiveReaction {
  emoji: string;
  x: number;       // canvas space
  y: number;       // canvas space
  startTime: number;
  vx: number;      // total horizontal screen-px drift at t=1
}

const REACTION_DURATION = 2000;
const REACTION_RISE = 80;    // screen px upward over full duration
const MAX_REACTIONS = 10;

const TRAIL_LENGTH = 5;
const CURSOR_LIFETIME = 4000;
const FADE_START = 2000;
const GHOST_START = 1000; // ms before FADE_START where ghost pulse begins

export class OverlayEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;
  private rafId: number | null = null;

  private cursors = new Map<string, TrackedCursor>();
  private reactions: ActiveReaction[] = [];
  private viewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
  private lastActivityAt = 0;

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
    this.markActivity();
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
    this.markActivity();
  }

  addReaction(emoji: string, x: number, y: number): void {
    if (this.reactions.length >= MAX_REACTIONS) this.reactions.shift();
    this.reactions.push({ emoji, x, y, startTime: Date.now(), vx: (Math.random() - 0.5) * 60 });
    this.markActivity();
  }

  removeUser(userId: string): void {
    this.cursors.delete(userId);
    this.markActivity();
  }

  handleResize(cssWidth: number, cssHeight: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.canvas.width = cssWidth * this.dpr;
    this.canvas.height = cssHeight * this.dpr;
    this.markActivity();
  }

  // ─── Render loop ─────────────────────────────────────────────────────────

  private markActivity(): void {
    this.lastActivityAt = Date.now();
  }

  private startLoop(): void {
    const tick = () => {
      const now = Date.now();
      // Render if there are visible cursors or if we recently cleared
      const hasCursors = this.cursors.size > 0;
      const recentActivity = now - this.lastActivityAt < CURSOR_LIFETIME + 200;

      if (hasCursors || recentActivity || this.reactions.length > 0) {
        this.render();
      }

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

      // Ghost pulse ring — appears as cursor goes idle
      const ghostAge = age - (FADE_START - GHOST_START);
      if (ghostAge > 0) {
        const pulsePhase = (now % 1400) / 1400;
        const pulseR = 12 + pulsePhase * 14;
        const pulseAlpha = alpha * 0.35 * (1 - pulsePhase);
        ctx.globalAlpha = pulseAlpha;
        ctx.strokeStyle = cursor.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, pulseR, 0, Math.PI * 2);
        ctx.stroke();
      }

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

    // ─── Reactions ────────────────────────────────────────────────────────────
    const alive: ActiveReaction[] = [];
    ctx.font = '28px serif';
    ctx.textAlign = 'center';
    for (const r of this.reactions) {
      const progress = (now - r.startTime) / REACTION_DURATION;
      if (progress >= 1) continue;
      alive.push(r);
      const sx = r.x * viewport.zoom + viewport.offsetX + r.vx * progress;
      const sy = r.y * viewport.zoom + viewport.offsetY - REACTION_RISE * progress;
      ctx.globalAlpha = 1 - progress;
      ctx.fillText(r.emoji, sx, sy);
    }
    this.reactions = alive;
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
