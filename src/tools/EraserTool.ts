import type { ITool, ToolEvent } from '../types';
import type { ToolContext } from './PenTool';

// Phase 2: erases by path intersection, not by painting white.
export class EraserTool implements ITool {
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onEvent(_event: ToolEvent): void {
    // Phase 2 implementation
  }

  cancel(): void {}
}
