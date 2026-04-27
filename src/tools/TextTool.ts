import type { ITool, ToolEvent, CanvasElement } from '../types';
import type { ToolContext } from './PenTool';

// Phase 2: click to place an invisible textarea, commit on blur/Enter.
export class TextTool implements ITool {
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onEvent(_event: ToolEvent): void {
    // Phase 2 implementation
  }

  cancel(): void {}
}
