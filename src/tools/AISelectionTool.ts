import type { ITool, ToolEvent, Rect, Point } from '../types';
import type { ToolContext } from './PenTool';

export class AISelectionTool implements ITool {
  private ctx: ToolContext;
  private start: Point | null = null;
  private active = false;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onEvent(event: ToolEvent): void {
    if (event.type === 'start') {
      this.start = event.canvasPoint;
      this.active = true;
      this.ctx.engine.setSelectionRect(null);
    } else if (event.type === 'move' && this.active && this.start) {
      this.ctx.engine.setSelectionRect(this.buildRect(this.start, event.canvasPoint));
    } else if (event.type === 'end' && this.active && this.start) {
      const rect = this.buildRect(this.start, event.canvasPoint);
      this.ctx.engine.setSelectionRect(null);
      this.active = false;
      this.start = null;
      // Ignore tiny drags (misclicks)
      if (rect.width < 10 || rect.height < 10) return;
      this.ctx.onAiRegion?.(rect);
    }
  }

  cancel(): void {
    this.active = false;
    this.start = null;
    this.ctx.engine.setSelectionRect(null);
    this.ctx.onAiRegion?.(null as unknown as Rect);
  }

  private buildRect(a: Point, b: Point): Rect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  }
}
