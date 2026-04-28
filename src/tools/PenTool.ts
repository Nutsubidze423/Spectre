import type { ITool, ToolEvent, CanvasElement, Point, Rect } from '../types';
import type { CanvasEngine } from '../canvas/CanvasEngine';

export interface ToolContext {
  engine: CanvasEngine;
  getColor: () => string;
  getStrokeWidth: () => number;
  getOpacity: () => number;
  getUserId: () => string;
  onElementAdd: (element: CanvasElement) => void;
  onElementUpdate: (id: string, changes: Partial<CanvasElement>) => void;
  onElementDelete: (ids: string[]) => void;
  pushSnapshot: () => void;
  onStrokePoint?: (elementId: string, point: Point) => void;
  onStrokeComplete?: (element: CanvasElement) => void;
  onAiRegion?: (rect: Rect) => void;
}

// Min pixel distance between recorded points (avoids redundant points)
const MIN_DIST = 3;

export class PenTool implements ITool {
  private ctx: ToolContext;
  private points: Point[] = [];
  private activeId: string | null = null;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onEvent(event: ToolEvent): void {
    if (event.type === 'start') {
      this.ctx.pushSnapshot();
      this.points = [event.canvasPoint];
      this.activeId = crypto.randomUUID();
      this.ctx.engine.setActiveStroke(
        this.points,
        this.ctx.getColor(),
        this.ctx.getStrokeWidth()
      );
    } else if (event.type === 'move') {
      if (!this.activeId) return;
      const last = this.points[this.points.length - 1];
      const dx = event.canvasPoint.x - last.x;
      const dy = event.canvasPoint.y - last.y;
      const dist = Math.hypot(dx, dy);
      // Skip points too close together — keeps path clean without losing fidelity
      const threshold = MIN_DIST / this.ctx.engine.getViewport().zoom;
      if (dist < threshold) return;

      this.points.push(event.canvasPoint);
      this.ctx.engine.setActiveStroke(
        this.points,
        this.ctx.getColor(),
        this.ctx.getStrokeWidth()
      );
      this.ctx.onStrokePoint?.(this.activeId, event.canvasPoint);
    } else if (event.type === 'end') {
      if (!this.activeId || this.points.length < 2) {
        this.cancel();
        return;
      }
      this.points.push(event.canvasPoint);

      const element: CanvasElement = {
        id: this.activeId,
        type: 'pen',
        points: [...this.points],
        x: 0, y: 0, width: 0, height: 0,
        color: this.ctx.getColor(),
        strokeWidth: this.ctx.getStrokeWidth(),
        opacity: this.ctx.getOpacity(),
        roughSeed: 0,
        createdBy: this.ctx.getUserId(),
        createdAt: Date.now(),
        version: 0,
      };

      this.ctx.engine.clearActiveStroke();
      if (this.ctx.onStrokeComplete) {
        this.ctx.onStrokeComplete(element);
      } else {
        this.ctx.onElementAdd(element);
      }
      this.activeId = null;
      this.points = [];
    }
  }

  cancel(): void {
    this.points = [];
    this.activeId = null;
    this.ctx.engine.clearActiveStroke();
  }
}
