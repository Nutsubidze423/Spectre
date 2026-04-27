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
  private activeStroke: ActiveStroke | null = null;
  private previewElement: Partial<CanvasElement> | null = null;
  private selectionRect: Rect | null = null;
  private remoteStrokes = new Map<string, ActiveStroke>();

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

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
