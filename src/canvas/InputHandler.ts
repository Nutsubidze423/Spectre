import type { CanvasEngine } from './CanvasEngine';
import type { Point, ToolEvent } from '../types';

interface ChatPos { sx: number; sy: number; cx: number; cy: number; }

interface InputHandlerOptions {
  engine: CanvasEngine;
  getActiveTool: () => string;
  onToolEvent: (event: ToolEvent) => void;
  onCursorMove?: (x: number, y: number) => void;
  onReaction?: (emoji: string, x: number, y: number) => void;
  onChatActivate?: (pos: ChatPos | null) => void;
  isChatActive?: () => boolean;
}

export class InputHandler {
  private engine: CanvasEngine;
  private getActiveTool: () => string;
  private onToolEvent: (event: ToolEvent) => void;
  private onCursorMove?: (x: number, y: number) => void;
  private onReaction?: (emoji: string, x: number, y: number) => void;
  private onChatActivate?: (pos: ChatPos | null) => void;
  private isChatActive?: () => boolean;
  private canvas: HTMLCanvasElement;

  // Pan state
  private isPanning = false;
  private panLast: Point | null = null;
  private isSpaceDown = false;

  // Drawing state
  private isPointerDown = false;

  // Last known cursor positions
  private lastCanvasPoint: Point = { x: 0, y: 0 };
  private lastScreenPoint: Point = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, options: InputHandlerOptions) {
    this.canvas = canvas;
    this.engine = options.engine;
    this.getActiveTool = options.getActiveTool;
    this.onToolEvent = options.onToolEvent;
    this.onCursorMove = options.onCursorMove;
    this.onReaction = options.onReaction;
    this.onChatActivate = options.onChatActivate;
    this.isChatActive = options.isChatActive;
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
    const sp = this.screenPoint(e);
    const cp = this.engine.toCanvasCoords(sp.x, sp.y);
    this.lastCanvasPoint = cp;
    this.lastScreenPoint = sp;

    if (!this.isChatActive?.()) this.onCursorMove?.(cp.x, cp.y);

    if (this.isPanning && this.panLast) {
      this.engine.pan(sp.x - this.panLast.x, sp.y - this.panLast.y);
      this.panLast = sp;
      return;
    }

    if (!this.isPointerDown) return;

    this.onToolEvent({
      type: 'move',
      screenPoint: sp,
      canvasPoint: cp,
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
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

    if (e.code === 'Space') {
      if (this.isSpaceDown) return;
      this.isSpaceDown = true;
      e.preventDefault();
      this.updateCursor();
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      if (this.isChatActive?.()) {
        this.onChatActivate?.(null);
      } else {
        this.onChatActivate?.({
          sx: this.lastScreenPoint.x,
          sy: this.lastScreenPoint.y,
          cx: this.lastCanvasPoint.x,
          cy: this.lastCanvasPoint.y,
        });
      }
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      const REACTIONS: Record<string, string> = {
        '1': '👍', '2': '❤️', '3': '🔥', '4': '😂', '5': '🎉', '6': '👀',
      };
      if (e.key in REACTIONS) {
        e.preventDefault();
        this.onReaction?.(REACTIONS[e.key], this.lastCanvasPoint.x, this.lastCanvasPoint.y);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    this.isSpaceDown = false;
    this.updateCursor();
  };
}
