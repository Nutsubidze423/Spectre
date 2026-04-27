import type { ITool, ToolEvent } from '../types';
import type { ToolContext } from './PenTool';
import type { SelectionManager } from '../canvas/SelectionManager';

// Phase 2: click-to-select, drag-to-multi-select, move + resize handles.
export class SelectionTool implements ITool {
  private ctx: ToolContext;
  private selectionManager: SelectionManager;

  constructor(ctx: ToolContext, selectionManager: SelectionManager) {
    this.ctx = ctx;
    this.selectionManager = selectionManager;
  }

  onEvent(_event: ToolEvent): void {
    // Phase 2 implementation
  }

  cancel(): void {
    this.selectionManager.clear();
  }
}
