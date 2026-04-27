import type { ITool, ToolEvent, CanvasElement, Point, Rect } from '../types';
import type { ToolContext } from './PenTool';
import { useCanvasStore } from '../store/canvasStore';

type Mode =
  | { kind: 'idle' }
  | { kind: 'rubber-band'; start: Point }
  | { kind: 'moving'; start: Point; origPositions: Map<string, { x: number; y: number }> };

function pointToSegmentDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export class SelectionTool implements ITool {
  private ctx: ToolContext;
  private mode: Mode = { kind: 'idle' };

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onEvent(event: ToolEvent): void {
    if (event.type === 'start') this.handleStart(event);
    else if (event.type === 'move') this.handleMove(event);
    else if (event.type === 'end') this.handleEnd(event);
  }

  cancel(): void {
    this.ctx.engine.setSelectionRect(null);
    useCanvasStore.getState().setSelectedIds([]);
    this.ctx.engine.setSelectedIds([]);
    this.mode = { kind: 'idle' };
  }

  // ─── Event handlers ───────────────────────────────────────────────────────

  private handleStart(event: ToolEvent): void {
    const { elements, selectedIds } = useCanvasStore.getState();
    const hitId = this.hitTest(event.canvasPoint, elements);

    if (hitId) {
      // Clicking already-selected element → start move
      const ids = event.shiftKey
        ? selectedIds.includes(hitId)
          ? selectedIds.filter((id) => id !== hitId)
          : [...selectedIds, hitId]
        : selectedIds.includes(hitId)
        ? selectedIds
        : [hitId];

      this.setSelected(ids);

      if (ids.includes(hitId)) {
        const origPositions = new Map<string, { x: number; y: number }>();
        for (const id of ids) {
          const el = elements.find((e) => e.id === id);
          if (el) origPositions.set(id, { x: el.x, y: el.y });
        }
        this.mode = { kind: 'moving', start: event.canvasPoint, origPositions };
      } else {
        this.mode = { kind: 'idle' };
      }
    } else {
      if (!event.shiftKey) this.setSelected([]);
      this.mode = { kind: 'rubber-band', start: event.canvasPoint };
    }
  }

  private handleMove(event: ToolEvent): void {
    if (this.mode.kind === 'rubber-band') {
      const { start } = this.mode;
      const rect: Rect = {
        x: Math.min(start.x, event.canvasPoint.x),
        y: Math.min(start.y, event.canvasPoint.y),
        width: Math.abs(event.canvasPoint.x - start.x),
        height: Math.abs(event.canvasPoint.y - start.y),
      };
      this.ctx.engine.setSelectionRect(rect);
    } else if (this.mode.kind === 'moving') {
      const { start, origPositions } = this.mode;
      const dx = event.canvasPoint.x - start.x;
      const dy = event.canvasPoint.y - start.y;
      for (const [id, orig] of origPositions) {
        useCanvasStore.getState().updateElement(id, { x: orig.x + dx, y: orig.y + dy });
      }
      this.ctx.engine.markDirty();
    }
  }

  private handleEnd(event: ToolEvent): void {
    if (this.mode.kind === 'rubber-band') {
      const { start } = this.mode;
      const rect: Rect = {
        x: Math.min(start.x, event.canvasPoint.x),
        y: Math.min(start.y, event.canvasPoint.y),
        width: Math.abs(event.canvasPoint.x - start.x),
        height: Math.abs(event.canvasPoint.y - start.y),
      };
      this.ctx.engine.setSelectionRect(null);
      const { elements } = useCanvasStore.getState();
      const ids = elements
        .filter((el) => this.elementInRect(el, rect))
        .map((el) => el.id);
      this.setSelected(ids);
    } else if (this.mode.kind === 'moving') {
      // Push snapshot after move completes (not during, to avoid polluting history)
      this.ctx.pushSnapshot();
    }
    this.mode = { kind: 'idle' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private setSelected(ids: string[]): void {
    useCanvasStore.getState().setSelectedIds(ids);
    this.ctx.engine.setSelectedIds(ids);
  }

  private hitTest(point: Point, elements: CanvasElement[]): string | null {
    const tolerance = 8 / this.ctx.engine.getViewport().zoom;
    // Test from top (last drawn) to bottom
    for (let i = elements.length - 1; i >= 0; i--) {
      if (this.elementHit(point, elements[i], tolerance)) return elements[i].id;
    }
    return null;
  }

  private elementHit(point: Point, el: CanvasElement, tolerance: number): boolean {
    if (el.type === 'pen' && el.points && el.points.length >= 2) {
      for (let i = 0; i < el.points.length - 1; i++) {
        if (pointToSegmentDist(point, el.points[i], el.points[i + 1]) < tolerance + el.strokeWidth / 2) {
          return true;
        }
      }
      return false;
    }
    // Text + shapes: bounding box
    return (
      point.x >= el.x - tolerance &&
      point.x <= el.x + Math.abs(el.width) + tolerance &&
      point.y >= el.y - tolerance &&
      point.y <= el.y + Math.abs(el.height) + tolerance
    );
  }

  private elementInRect(el: CanvasElement, rect: Rect): boolean {
    const ex = el.x;
    const ey = el.y;
    const ew = el.x + Math.abs(el.width);
    const eh = el.y + Math.abs(el.height);
    const rx2 = rect.x + rect.width;
    const ry2 = rect.y + rect.height;
    return ex <= rx2 && ew >= rect.x && ey <= ry2 && eh >= rect.y;
  }
}
