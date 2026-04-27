import type { CanvasElement, Point } from '../types';

// Phase 2 will replace these raw Canvas calls with Rough.js for shapes.
export class ElementRenderer {
  private ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  renderAll(elements: CanvasElement[]): void {
    for (const el of elements) {
      this.renderElement(el);
    }
  }

  renderElement(el: CanvasElement): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = el.opacity;
    ctx.strokeStyle = el.color;
    ctx.fillStyle = el.color;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (el.type) {
      case 'pen': this.renderPen(el); break;
      case 'rect': this.renderRect(el); break;
      case 'ellipse': this.renderEllipse(el); break;
      case 'line': this.renderLine(el); break;
      case 'arrow': this.renderArrow(el); break;
      case 'text': this.renderText(el); break;
    }

    ctx.restore();
  }

  // Live in-progress stroke — drawn without a full CanvasElement
  renderInProgressStroke(points: Point[]): void {
    if (points.length < 2) return;
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = '#e8e8f0';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private renderPen(el: CanvasElement): void {
    if (!el.points || el.points.length < 2) return;
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) {
      ctx.lineTo(el.points[i].x, el.points[i].y);
    }
    ctx.stroke();
  }

  private renderRect(el: CanvasElement): void {
    this.ctx.strokeRect(el.x, el.y, el.width, el.height);
  }

  private renderEllipse(el: CanvasElement): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.ellipse(
      el.x + el.width / 2,
      el.y + el.height / 2,
      Math.abs(el.width / 2),
      Math.abs(el.height / 2),
      0, 0, Math.PI * 2
    );
    ctx.stroke();
  }

  private renderLine(el: CanvasElement): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x + el.width, el.y + el.height);
    ctx.stroke();
  }

  private renderArrow(el: CanvasElement): void {
    const { ctx } = this;
    const x1 = el.x;
    const y1 = el.y;
    const x2 = el.x + el.width;
    const y2 = el.y + el.height;

    // Shaft
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(10, el.strokeWidth * 4);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.stroke();
  }

  private renderText(el: CanvasElement): void {
    if (!el.text) return;
    const { ctx } = this;
    const fontSize = Math.max(14, el.strokeWidth * 7);
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    ctx.fillText(el.text, el.x, el.y);
  }
}
