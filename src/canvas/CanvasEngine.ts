import type { CanvasElement, Viewport, Point, Rect } from '../types';
import { ElementRenderer } from './ElementRenderer';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8.0;
const GRID_SIZE = 40;

interface ActiveStroke {
  points: Point[];
  color: string;
  strokeWidth: number;
}

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private elementRenderer: ElementRenderer;

  viewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };

  private isDirty = true;
  private rafId: number | null = null;
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  private elements: CanvasElement[] = [];
  private selectedIds: string[] = [];
  private highlightIds = new Set<string>();
  private activeStroke: ActiveStroke | null = null;
  private previewElement: Partial<CanvasElement> | null = null;
  private selectionRect: Rect | null = null;
  private remoteStrokes = new Map<string, ActiveStroke>();
  private panAnimId: number | null = null;

  private onViewportChange?: (v: Viewport) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.elementRenderer = new ElementRenderer(ctx);
    this.handleResize();
    this.startRenderLoop();
  }

  // ─── Coordinate transforms ────────────────────────────────────────────────

  toCanvasCoords(screenX: number, screenY: number): Point {
    return {
      x: (screenX - this.viewport.offsetX) / this.viewport.zoom,
      y: (screenY - this.viewport.offsetY) / this.viewport.zoom,
    };
  }

  toScreenCoords(canvasX: number, canvasY: number): Point {
    return {
      x: canvasX * this.viewport.zoom + this.viewport.offsetX,
      y: canvasY * this.viewport.zoom + this.viewport.offsetY,
    };
  }

  // ─── Viewport ─────────────────────────────────────────────────────────────

  pan(dx: number, dy: number): void {
    this.viewport.offsetX += dx;
    this.viewport.offsetY += dy;
    this.onViewportChange?.({ ...this.viewport });
    this.markDirty();
  }

  zoomAt(factor: number, screenX: number, screenY: number): void {
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.viewport.zoom * factor));
    if (newZoom === this.viewport.zoom) return;
    const cp = this.toCanvasCoords(screenX, screenY);
    this.viewport.zoom = newZoom;
    this.viewport.offsetX = screenX - cp.x * newZoom;
    this.viewport.offsetY = screenY - cp.y * newZoom;
    this.onViewportChange?.({ ...this.viewport });
    this.markDirty();
  }

  setViewportChangeCallback(cb: (v: Viewport) => void): void {
    this.onViewportChange = cb;
  }

  // ─── Element / overlay state setters ─────────────────────────────────────

  setElements(elements: CanvasElement[]): void {
    this.elements = elements;
    this.markDirty();
  }

  setSelectedIds(ids: string[]): void {
    this.selectedIds = ids;
    this.markDirty();
  }

  setHighlightIds(ids: string[]): void {
    this.highlightIds = new Set(ids);
    this.markDirty();
  }

  setActiveStroke(points: Point[], color: string, strokeWidth: number): void {
    this.activeStroke = { points, color, strokeWidth };
    this.markDirty();
  }

  clearActiveStroke(): void {
    this.activeStroke = null;
    this.markDirty();
  }

  setPreviewElement(el: Partial<CanvasElement> | null): void {
    this.previewElement = el;
    this.markDirty();
  }

  setSelectionRect(rect: Rect | null): void {
    this.selectionRect = rect;
    this.markDirty();
  }

  setRemoteStrokePoint(elementId: string, point: Point, color: string, strokeWidth: number): void {
    const existing = this.remoteStrokes.get(elementId);
    if (existing) {
      existing.points.push(point);
    } else {
      this.remoteStrokes.set(elementId, { points: [point], color, strokeWidth });
    }
    this.markDirty();
  }

  clearRemoteStroke(elementId: string): void {
    this.remoteStrokes.delete(elementId);
    this.markDirty();
  }

  clearAllRemoteStrokes(): void {
    this.remoteStrokes.clear();
    this.markDirty();
  }

  // ─── Dirty / resize ──────────────────────────────────────────────────────

  markDirty(): void {
    this.isDirty = true;
  }

  handleResize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    if (w === 0 || h === 0) return;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.dpr = dpr;
    this.cssWidth = w;
    this.cssHeight = h;
    this.markDirty();
  }

  // ─── Render loop ──────────────────────────────────────────────────────────

  private startRenderLoop(): void {
    const tick = () => {
      if (this.isDirty) {
        this.render();
        this.isDirty = false;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private render(): void {
    const { ctx, dpr, cssWidth, cssHeight } = this;
    if (cssWidth === 0 || cssHeight === 0) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.save();
    ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
    ctx.scale(this.viewport.zoom, this.viewport.zoom);

    this.renderGrid();
    this.elementRenderer.renderAll(this.elements);

    for (const stroke of this.remoteStrokes.values()) {
      if (stroke.points.length > 1) this.elementRenderer.renderActiveStroke(stroke);
    }
    if (this.activeStroke && this.activeStroke.points.length > 1) {
      this.elementRenderer.renderActiveStroke(this.activeStroke);
    }
    if (this.previewElement && this.previewElement.type) {
      this.elementRenderer.renderPreview(this.previewElement as CanvasElement);
    }
    if (this.selectedIds.length > 0) {
      this.elementRenderer.renderSelectionOverlay(
        this.elements, this.selectedIds, this.viewport
      );
    }
    if (this.selectionRect) {
      this.elementRenderer.renderSelectionRect(this.selectionRect);
    }
    if (this.highlightIds.size > 0) {
      this.renderSearchHighlights();
    }

    ctx.restore();
  }

  private renderSearchHighlights(): void {
    const { ctx, viewport } = this;
    const invZoom = 1 / viewport.zoom;

    ctx.save();
    ctx.strokeStyle = '#7c6af7';
    ctx.lineWidth = 2 * invZoom;
    ctx.shadowColor = '#7c6af7';
    ctx.shadowBlur = 12 * invZoom;
    ctx.globalAlpha = 0.85;

    for (const el of this.elements) {
      if (!this.highlightIds.has(el.id)) continue;

      let x: number, y: number, w: number, h: number;
      if (el.points && el.points.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const pt of el.points) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        x = minX - 8 * invZoom; y = minY - 8 * invZoom;
        w = (maxX - minX) + 16 * invZoom; h = (maxY - minY) + 16 * invZoom;
      } else {
        x = el.x - 6 * invZoom; y = el.y - 6 * invZoom;
        w = (el.width || 120) + 12 * invZoom; h = (el.height || 32) + 12 * invZoom;
      }

      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 6 * invZoom);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ─── Grid ─────────────────────────────────────────────────────────────────

  private renderGrid(): void {
    const { ctx, viewport, cssWidth, cssHeight } = this;
    const screenSpacing = GRID_SIZE * viewport.zoom;
    if (screenSpacing < 8) return;

    const opacity = Math.min(1, (screenSpacing - 8) / 32) * 0.4;
    if (opacity <= 0) return;

    const left = -viewport.offsetX / viewport.zoom;
    const top = -viewport.offsetY / viewport.zoom;
    const right = (cssWidth - viewport.offsetX) / viewport.zoom;
    const bottom = (cssHeight - viewport.offsetY) / viewport.zoom;

    const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;
    const dotR = Math.max(0.4, 1.5 / viewport.zoom);

    ctx.fillStyle = `rgba(120, 120, 160, ${opacity})`;

    for (let x = startX; x <= right; x += GRID_SIZE) {
      for (let y = startY; y <= bottom; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  getViewport(): Viewport { return { ...this.viewport }; }
  getCanvas(): HTMLCanvasElement { return this.canvas; }

  captureRegion(rect: Rect): string {
    const { zoom, offsetX, offsetY } = this.viewport;
    const sx = rect.x * zoom + offsetX;
    const sy = rect.y * zoom + offsetY;
    const sw = rect.width * zoom;
    const sh = rect.height * zoom;

    const cx = Math.max(0, sx);
    const cy = Math.max(0, sy);
    const cw = Math.min(sw, this.cssWidth - cx);
    const ch = Math.min(sh, this.cssHeight - cy);
    if (cw <= 0 || ch <= 0) return '';

    const off = document.createElement('canvas');
    off.width = Math.ceil(cw);
    off.height = Math.ceil(ch);
    const offCtx = off.getContext('2d');
    if (!offCtx) return '';

    offCtx.drawImage(
      this.canvas,
      cx * this.dpr, cy * this.dpr,
      cw * this.dpr, ch * this.dpr,
      0, 0,
      cw, ch
    );

    return off.toDataURL('image/png').split(',')[1];
  }

  captureFullCanvas(): string {
    const scale = 0.28;
    const off = document.createElement('canvas');
    off.width = Math.floor(this.cssWidth * scale);
    off.height = Math.floor(this.cssHeight * scale);
    const offCtx = off.getContext('2d');
    if (!offCtx) return '';
    offCtx.drawImage(
      this.canvas,
      0, 0, this.canvas.width, this.canvas.height,
      0, 0, off.width, off.height
    );
    return off.toDataURL('image/jpeg', 0.75);
  }

  // ─── Viewport helpers ─────────────────────────────────────────────────────

  resetViewport(): void {
    this.viewport = { offsetX: 0, offsetY: 0, zoom: 1 };
    this.onViewportChange?.({ ...this.viewport });
    this.markDirty();
  }

  fitToContent(elements: CanvasElement[], padding = 40): void {
    if (elements.length === 0) {
      this.resetViewport();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      if (el.points && el.points.length > 0) {
        for (const pt of el.points) {
          if (minX > pt.x) minX = pt.x;
          if (minY > pt.y) minY = pt.y;
          if (maxX < pt.x) maxX = pt.x;
          if (maxY < pt.y) maxY = pt.y;
        }
      } else {
        if (minX > el.x) minX = el.x;
        if (minY > el.y) minY = el.y;
        if (maxX < el.x + el.width) maxX = el.x + el.width;
        if (maxY < el.y + el.height) maxY = el.y + el.height;
      }
    }

    const bboxW = maxX - minX || 1;
    const bboxH = maxY - minY || 1;
    const availW = this.cssWidth - 2 * padding;
    const availH = this.cssHeight - 2 * padding;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(availW / bboxW, availH / bboxH)));
    const offsetX = padding + (availW - bboxW * zoom) / 2 - minX * zoom;
    const offsetY = padding + (availH - bboxH * zoom) / 2 - minY * zoom;

    this.viewport = { offsetX, offsetY, zoom };
    this.onViewportChange?.({ ...this.viewport });
    this.markDirty();
  }

  smoothPanToCanvas(cx: number, cy: number): void {
    if (this.panAnimId !== null) {
      cancelAnimationFrame(this.panAnimId);
      this.panAnimId = null;
    }

    const { zoom, offsetX, offsetY } = this.viewport;
    const sx = cx * zoom + offsetX;
    const sy = cy * zoom + offsetY;
    const margin = 60;

    // Skip if center already within viewport
    if (
      sx >= margin && sx <= this.cssWidth - margin &&
      sy >= margin && sy <= this.cssHeight - margin
    ) return;

    const targetOffX = this.cssWidth / 2 - cx * zoom;
    const targetOffY = this.cssHeight / 2 - cy * zoom;
    const startOffX = this.viewport.offsetX;
    const startOffY = this.viewport.offsetY;
    const startTime = performance.now();
    const DURATION = 280;

    const animate = (now: number) => {
      const t = Math.min(1, (now - startTime) / DURATION);
      const ease = 1 - Math.pow(1 - t, 3);
      this.viewport.offsetX = startOffX + (targetOffX - startOffX) * ease;
      this.viewport.offsetY = startOffY + (targetOffY - startOffY) * ease;
      this.onViewportChange?.({ ...this.viewport });
      this.markDirty();
      if (t < 1) {
        this.panAnimId = requestAnimationFrame(animate);
      } else {
        this.panAnimId = null;
      }
    };
    this.panAnimId = requestAnimationFrame(animate);
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.panAnimId !== null) cancelAnimationFrame(this.panAnimId);
    this.rafId = null;
    this.panAnimId = null;
  }
}
