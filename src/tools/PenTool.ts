import type { ITool, ToolEvent, CanvasElement, Point } from '../types';
import type { CanvasEngine } from '../canvas/CanvasEngine';

export interface ToolContext {
  engine: CanvasEngine;
  getColor: () => string;
  getStrokeWidth: () => number;
  getOpacity: () => number;
  getUserId: () => string;
  onElementAdd: (element: CanvasElement) => void;
  onElementUpdate: (id: string, changes: Partial<CanvasElement>) => void;
}

// Phase 2: Catmull-Rom spline smoothing over raw mouse points.
export class PenTool implements ITool {
  private ctx: ToolContext;
  private activePoints: Point[] = [];
  private activeId: string | null = null;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onEvent(_event: ToolEvent): void {
    // Phase 2 implementation
  }

  cancel(): void {
    this.activePoints = [];
    this.activeId = null;
    this.ctx.engine.clearActiveStroke();
  }
}
