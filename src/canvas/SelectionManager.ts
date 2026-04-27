import type { CanvasElement, Point, Rect } from '../types';

// Manages selection state, resize handles, and drag-move logic.
// Phase 2: full implementation with 8 resize handles + keyboard delete.
export class SelectionManager {
  private selectedIds: Set<string> = new Set();

  select(ids: string[]): void {
    this.selectedIds = new Set(ids);
  }

  clear(): void {
    this.selectedIds.clear();
  }

  getSelectedIds(): string[] {
    return [...this.selectedIds];
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  // Returns bounding box of all selected elements
  getBoundingBox(elements: CanvasElement[]): Rect | null {
    const selected = elements.filter((el) => this.selectedIds.has(el.id));
    if (selected.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of selected) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  // Hit-test a point against an element (Phase 2: proper path intersection)
  hitTest(_point: Point, _element: CanvasElement): boolean {
    return false;
  }
}
