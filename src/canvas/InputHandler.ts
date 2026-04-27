import type { CanvasEngine } from './CanvasEngine';
import type { Point, ToolEvent } from '../types';

interface InputHandlerOptions {
  engine: CanvasEngine;
  getActiveTool: () => string;
  onToolEvent: (event: ToolEvent) => void;
}

export class InputHandler {
  private engine: CanvasEngine;
  private getActiveTool: () => string;
  private onToolEvent: (event: ToolEvent) => void;
  private canvas: HTMLCanvasElement;

  // Pan state
  private isPanning = false;
  private panLast: Point | null = null;
  private isSpaceDown = false;

  // Drawing state
  private isPointerDown = false;

  constructor(canvas: HTMLCanvasElement, options: InputHandlerOptions) {
    this.canvas = canvas;
    this.engine = options.engine;
    this.getActiveTool = options.getActiveTool;
    this.onToolEvent = options.onToolEvent;
    this.attach();
  }

  // ─── Attach / detach ─────────────────────────────────────────────────────

  private attach(): void {
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private screenPoint(e: MouseEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private wantsPan(e: MouseEvent): boolean {
    return e.button === 1 || (e.button === 0 && this.isSpaceDown);
  }

  private updateCursor(): void {
    if (this.isPanning) {
      this.canvas.style.cursor = 'grabbing';
    } else if (this.isSpaceDown) {
      this.canvas.style.cursor = 'grab';
    } else {
      const tool = this.getActiveTool();
      this.canvas.style.cursor = tool === 'text' ? 'text' : 'crosshair';
    }
  }

  // ─── Mouse events ─────────────────────────────────────────────────────────

  private onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();

    if (this.wantsPan(e)) {
      this.isPanning = true;
      this.panLast = this.screenPoint(e);
      this.updateCursor();
      return;
    }

    if (e.button !== 0) return;

    const sp = this.screenPoint(e);
    this.isPointerDown = true;

    this.onToolEvent({
      type: 'start',
      screenPoint: sp,
      canvasPoint: this.engine.toCanvasCoords(sp.x, sp.y),
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey || e.metaKey,
    });
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (this.isPanning && this.panLast) {
      const sp = this.screenPoint(e);
      this.engine.pan(sp.x - this.panLast.x, sp.y - this.panLast.y);
      this.panLast = sp;
      return;
    }

    if (!this.isPointerDown) return;

    const sp = this.screenPoint(e);
    this.onToolEvent({
      type: 'move',
      screenPoint: sp,
      canvasPoint: this.engine.toCanvasCoords(sp.x, sp.y),
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey || e.metaKey,
    });
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (this.isPanning) {
      this.isPanning = false;
      this.panLast = null;
      this.updateCursor();
      return;
    }

    if (!this.isPointerDown) return;
    this.isPointerDown = false;

    const sp = this.screenPoint(e);
    this.onToolEvent({
      type: 'end',
      screenPoint: sp,
      canvasPoint: this.engine.toCanvasCoords(sp.x, sp.y),
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey || e.metaKey,
    });
  };

  private onMouseLeave = (_e: MouseEvent): void => {
    // Cancel drawing if pointer leaves canvas
    if (this.isPointerDown) {
      this.isPointerDown = false;
      // Synthesise an 'end' so tools can clean up
    }
  };

  // ─── Wheel (zoom) ─────────────────────────────────────────────────────────

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const sp = this.screenPoint(e);
    // Normalise delta: pixel mode is fine raw, line mode needs scaling
    const delta = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? e.deltaY : e.deltaY * 16;
    const factor = Math.pow(0.999, delta);
    this.engine.zoomAt(factor, sp.x, sp.y);
  };

  // ─── Keyboard ─────────────────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (this.isSpaceDown) return;
    this.isSpaceDown = true;
    e.preventDefault();
    this.updateCursor();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    this.isSpaceDown = false;
    this.updateCursor();
  };
}
