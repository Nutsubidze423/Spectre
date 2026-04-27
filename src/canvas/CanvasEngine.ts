import type { CanvasElement, Viewport, Point } from '../types';
import { ElementRenderer } from './ElementRenderer';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8.0;
const GRID_SIZE = 40; // canvas units between grid dots

export class CanvasEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private elementRenderer: ElementRenderer;

  // Viewport state
  viewport: Viewport = { offsetX: 0, offsetY: 0, zoom: 1 };

  // Render state
  private isDirty = true;
  private rafId: number | null = null;

  // Physical canvas dimensions (CSS px)
  private dpr = 1;
  private cssWidth = 0;
  private cssHeight = 0;

  // Element list (updated via setElements)
  private elements: CanvasElement[] = [];

  // Active in-progress pen stroke for incremental rendering
  private activeStrokePoints: Point[] = [];

  // Callback to sync viewport changes back to the store
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

  // ─── Viewport manipulation ────────────────────────────────────────────────

  pan(dx: number, dy: number): void {
    this.viewport.offsetX += dx;
    this.viewport.offsetY += dy;
    this.onViewportChange?.({ ...this.viewport });
    this.markDirty();
  }

  zoomAt(factor: number, screenX: number, screenY: number): void {
    const raw = this.viewport.zoom * factor;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw));
    if (newZoom === this.viewport.zoom) return;

    // Zoom toward cursor: pin the canvas point under the cursor
    const canvasPoint = this.toCanvasCoords(screenX, screenY);
    this.viewport.zoom = newZoom;
    this.viewport.offsetX = screenX - canvasPoint.x * newZoom;
    this.viewport.offsetY = screenY - canvasPoint.y * newZoom;

    this.onViewportChange?.({ ...this.viewport });
    this.markDirty();
  }

  setViewportChangeCallback(cb: (v: Viewport) => void): void {
    this.onViewportChange = cb;
  }

  // ─── Elements ─────────────────────────────────────────────────────────────

  setElements(elements: CanvasElement[]): void {
    this.elements = elements;
    this.markDirty();
  }

  setActiveStroke(points: Point[]): void {
    this.activeStrokePoints = points;
    this.markDirty();
  }

  clearActiveStroke(): void {
    this.activeStrokePoints = [];
    this.markDirty();
  }

  // ─── Dirty / resize ──────────────────────────────────────────────────────

  markDirty(): void {
    this.isDirty = true;
  }

  handleResize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = Math.floor(rect.width);
    const cssHeight = Math.floor(rect.height);

    if (cssWidth === 0 || cssHeight === 0) return;

    this.canvas.width = cssWidth * dpr;
    this.canvas.height = cssHeight * dpr;
    this.dpr = dpr;
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;

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

    // Reset to device pixel transform baseline
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Apply viewport transform
    ctx.save();
    ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
    ctx.scale(this.viewport.zoom, this.viewport.zoom);

    this.renderGrid();
    this.elementRenderer.renderAll(this.elements);

    // In-progress stroke (incremental during drawing)
    if (this.activeStrokePoints.length > 1) {
      this.elementRenderer.renderInProgressStroke(this.activeStrokePoints);
    }

    ctx.restore();
  }

  // ─── Grid ─────────────────────────────────────────────────────────────────

  private renderGrid(): void {
    const { ctx, viewport, cssWidth, cssHeight } = this;

    const screenSpacing = GRID_SIZE * viewport.zoom;
    if (screenSpacing < 8) return; // too dense to show

    const opacity = Math.min(1, (screenSpacing - 8) / 32) * 0.4;
    if (opacity <= 0) return;

    // Visible canvas bounds
    const left = -viewport.offsetX / viewport.zoom;
    const top = -viewport.offsetY / viewport.zoom;
    const right = (cssWidth - viewport.offsetX) / viewport.zoom;
    const bottom = (cssHeight - viewport.offsetY) / viewport.zoom;

    const startX = Math.floor(left / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(top / GRID_SIZE) * GRID_SIZE;

    // Dot radius in canvas units ≈ 1.5px screen space
    const dotRadius = Math.max(0.4, 1.5 / viewport.zoom);

    ctx.fillStyle = `rgba(120, 120, 160, ${opacity})`;

    for (let x = startX; x <= right; x += GRID_SIZE) {
      for (let y = startY; y <= bottom; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  getViewport(): Viewport {
    return { ...this.viewport };
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}
