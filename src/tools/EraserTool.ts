import type { ITool, ToolEvent, CanvasElement, Point } from '../types';
import type { ToolContext } from './PenTool';
import { useCanvasStore } from '../store/canvasStore';

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export class EraserTool implements ITool {
  private ctx: ToolContext;
  private snapshotPushed = false;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onEvent(event: ToolEvent): void {
    if (event.type === 'start') {
      this.snapshotPushed = false;
      this.eraseAt(event.canvasPoint);
    } else if (event.type === 'move') {
      this.eraseAt(event.canvasPoint);
    } else if (event.type === 'end') {
      this.eraseAt(event.canvasPoint);
      this.snapshotPushed = false;
    }
  }

  cancel(): void {
    this.snapshotPushed = false;
  }

  private eraseAt(point: Point): void {
    const elements = useCanvasStore.getState().elements;
    const zoom = this.ctx.engine.getViewport().zoom;
    // Radius in canvas units: base 16px screen space, scaled by strokeWidth
    const radius = (this.ctx.getStrokeWidth() * 8) / zoom;
    const toDelete: string[] = [];

    for (const el of elements) {
      if (this.intersects(el, point, radius)) toDelete.push(el.id);
    }

    if (toDelete.length > 0) {
      if (!this.snapshotPushed) {
        this.ctx.pushSnapshot();
        this.snapshotPushed = true;
      }
      this.ctx.onElementDelete(toDelete);
    }
  }

  private intersects(el: CanvasElement, point: Point, radius: number): boolean {
    if (el.type === 'pen' && el.points && el.points.length >= 2) {
      for (let i = 0; i < el.points.length - 1; i++) {
        if (pointToSegmentDist(point, el.points[i], el.points[i + 1]) < radius + el.strokeWidth / 2) {
          return true;
        }
      }
      return false;
    }

    // Text/shape: expanded bounding box check
    const m = radius;
    const lx = el.x - m;
    const ly = el.y - m;
    const rx = el.x + Math.abs(el.width) + m;
    const ry = el.y + Math.abs(el.height) + m;
    return point.x >= lx && point.x <= rx && point.y >= ly && point.y <= ry;
  }
}
