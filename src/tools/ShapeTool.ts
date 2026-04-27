import type { ITool, ToolEvent, CanvasElement } from '../types';
import type { ToolContext } from './PenTool';

// Phase 2: renders rect/ellipse/line/arrow via Rough.js with fixed roughSeed.
export class ShapeTool implements ITool {
  private ctx: ToolContext;
  private shapeType: 'rect' | 'ellipse' | 'line' | 'arrow';
  private activeId: string | null = null;

  constructor(ctx: ToolContext, shapeType: 'rect' | 'ellipse' | 'line' | 'arrow') {
    this.ctx = ctx;
    this.shapeType = shapeType;
  }

  onEvent(_event: ToolEvent): void {
    // Phase 2 implementation
  }

  cancel(): void {
    if (this.activeId) {
      // Remove the in-progress shape
      this.activeId = null;
    }
  }
}
