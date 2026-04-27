import type { ITool, ToolEvent, CanvasElement, Point } from '../types';
import type { ToolContext } from './PenTool';

export class TextTool implements ITool {
  private ctx: ToolContext;
  private pendingInput: HTMLDivElement | null = null;
  private pendingPoint: Point | null = null;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onEvent(event: ToolEvent): void {
    if (event.type !== 'start') return;
    // Commit any existing input first
    this.commitPending();
    this.placeInput(event.canvasPoint, event.screenPoint);
  }

  cancel(): void {
    this.commitPending();
  }

  private placeInput(canvasPoint: Point, screenPoint: Point): void {
    const vp = this.ctx.engine.getViewport();
    const fontSize = Math.max(14, this.ctx.getStrokeWidth() * 7) * vp.zoom;
    const color = this.ctx.getColor();

    const div = document.createElement('div');
    div.contentEditable = 'true';
    div.className = 'text-tool-input';
    div.style.left = `${screenPoint.x}px`;
    div.style.top = `${screenPoint.y - fontSize * 0.85}px`;
    div.style.fontSize = `${fontSize}px`;
    div.style.color = color;
    div.style.minWidth = `${Math.max(80, fontSize * 5)}px`;

    document.body.appendChild(div);
    div.focus();

    this.pendingInput = div;
    this.pendingPoint = canvasPoint;

    const commit = () => this.commitPending();
    div.addEventListener('blur', commit);
    div.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { div.textContent = ''; div.blur(); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); div.blur(); }
    });
  }

  private commitPending(): void {
    const div = this.pendingInput;
    const pt = this.pendingPoint;
    if (!div || !pt) return;

    const text = (div.textContent ?? '').trim();
    if (text) {
      this.ctx.pushSnapshot();
      const el: CanvasElement = {
        id: crypto.randomUUID(),
        type: 'text',
        text,
        x: pt.x, y: pt.y,
        width: 0, height: 0,
        color: this.ctx.getColor(),
        strokeWidth: this.ctx.getStrokeWidth(),
        opacity: this.ctx.getOpacity(),
        roughSeed: 0,
        createdBy: this.ctx.getUserId(),
        createdAt: Date.now(),
        version: 0,
      };
      this.ctx.onElementAdd(el);
    }

    if (document.body.contains(div)) document.body.removeChild(div);
    this.pendingInput = null;
    this.pendingPoint = null;
  }
}
