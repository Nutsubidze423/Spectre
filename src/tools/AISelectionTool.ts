import type { ITool, ToolEvent, Rect } from '../types';
import type { ToolContext } from './PenTool';

// Phase 4: drag to select a canvas region, then show the AI prompt input.
export class AISelectionTool implements ITool {
  private ctx: ToolContext;
  private onRegionSelected?: (region: Rect) => void;

  constructor(ctx: ToolContext, onRegionSelected?: (region: Rect) => void) {
    this.ctx = ctx;
    this.onRegionSelected = onRegionSelected;
  }

  onEvent(_event: ToolEvent): void {
    // Phase 4 implementation
  }

  cancel(): void {}
}
