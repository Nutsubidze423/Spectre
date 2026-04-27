import type { ITool, ToolEvent, CanvasElement, Point, ElementType } from '../types';
import type { ToolContext } from './PenTool';

type ShapeType = 'rect' | 'ellipse' | 'line' | 'arrow';

export class ShapeTool implements ITool {
  private ctx: ToolContext;
  private shapeType: ShapeType;
  private startPoint: Point | null = null;
  private activeId: string | null = null;

  constructor(ctx: ToolContext, shapeType: ShapeType) {
    this.ctx = ctx;
    this.shapeType = shapeType;
  }

  onEvent(event: ToolEvent): void {
    if (event.type === 'start') {
      this.ctx.pushSnapshot();
      this.startPoint = event.canvasPoint;
      this.activeId = crypto.randomUUID();
    } else if (event.type === 'move' && this.startPoint) {
      const preview = this.buildElement(
        this.activeId!,
        this.startPoint,
        event.canvasPoint,
        event.shiftKey
      );
      this.ctx.engine.setPreviewElement(preview);
    } else if (event.type === 'end' && this.startPoint) {
      const el = this.buildElement(
        this.activeId!,
        this.startPoint,
        event.canvasPoint,
        event.shiftKey
      );

      // Discard tiny accidental clicks
      const tooSmall =
        (this.shapeType === 'line' || this.shapeType === 'arrow')
          ? Math.hypot(el.width, el.height) < 4
          : Math.abs(el.width) < 4 && Math.abs(el.height) < 4;

      this.ctx.engine.setPreviewElement(null);

      if (!tooSmall) this.ctx.onElementAdd(el);

      this.startPoint = null;
      this.activeId = null;
    }
  }

  cancel(): void {
    this.startPoint = null;
    this.activeId = null;
    this.ctx.engine.setPreviewElement(null);
  }

  private buildElement(
    id: string,
    start: Point,
    end: Point,
    constrain: boolean
  ): CanvasElement {
    let { x: ex, y: ey } = start;
    let ew = end.x - start.x;
    let eh = end.y - start.y;

    // Shift key: constrain to square / 45° line
    if (constrain) {
      if (this.shapeType === 'line' || this.shapeType === 'arrow') {
        const angle = Math.atan2(eh, ew);
        const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(ew, eh);
        ew = Math.cos(snap) * len;
        eh = Math.sin(snap) * len;
      } else {
        const side = Math.min(Math.abs(ew), Math.abs(eh));
        ew = Math.sign(ew) * side;
        eh = Math.sign(eh) * side;
      }
    }

    // Normalise rect/ellipse origin to top-left
    if (this.shapeType === 'rect' || this.shapeType === 'ellipse') {
      if (ew < 0) { ex += ew; ew = Math.abs(ew); }
      if (eh < 0) { ey += eh; eh = Math.abs(eh); }
    }

    return {
      id,
      type: this.shapeType as ElementType,
      x: ex, y: ey,
      width: ew, height: eh,
      color: this.ctx.getColor(),
      strokeWidth: this.ctx.getStrokeWidth(),
      opacity: this.ctx.getOpacity(),
      roughSeed: Math.floor(Math.random() * 2 ** 31),
      createdBy: this.ctx.getUserId(),
      createdAt: Date.now(),
      version: 0,
    };
  }
}
