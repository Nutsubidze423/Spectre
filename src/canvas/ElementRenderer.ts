import rough from 'roughjs';
import type { CanvasElement, Point, Rect, Viewport } from '../types';

interface ActiveStroke {
  points: Point[];
  color: string;
  strokeWidth: number;
}

// ─── Catmull-Rom to Bezier helper ────────────────────────────────────────────

function drawCatmullRom(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y);
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    ctx.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
}

export class ElementRenderer {
  private ctx: CanvasRenderingContext2D;
  private rc: ReturnType<typeof rough.canvas>;
  private generator = rough.generator();
  // Cache: key = `${elementId}-${version}` → Rough.js Drawable
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private drawableCache = new Map<string, any>();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
    this.rc = rough.canvas(ctx.canvas);
  }

  // ─── Public render methods ────────────────────────────────────────────────

  renderAll(elements: CanvasElement[]): void {
    for (const el of elements) this.renderElement(el);
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
      case 'pen':    this.renderPen(el); break;
      case 'rect':   this.renderShapeRough(el); break;
      case 'ellipse': this.renderShapeRough(el); break;
      case 'line':   this.renderShapeRough(el); break;
      case 'arrow':  this.renderShapeRough(el); break;
      case 'text':   this.renderText(el); break;
      case 'ai':     this.renderElement({ ...el, type: 'rect' }); break;
    }

    ctx.restore();
  }

  renderActiveStroke(stroke: ActiveStroke): void {
    const { ctx } = this;
    const { points, color, strokeWidth } = stroke;
    if (points.length < 2) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    drawCatmullRom(ctx, points);
    ctx.stroke();
    ctx.restore();
  }

  renderPreview(el: CanvasElement): void {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = (el.opacity ?? 1) * 0.75;
    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Render without cache (preview changes every frame)
    switch (el.type) {
      case 'pen':    this.renderPen(el); break;
      case 'rect':
      case 'ellipse':
      case 'line':
      case 'arrow':  this.renderShapeImmediate(el); break;
      case 'text':   this.renderText(el); break;
    }

    ctx.restore();
  }

  renderSelectionOverlay(
    elements: CanvasElement[],
    selectedIds: string[],
    viewport: Viewport
  ): void {
    const selected = elements.filter((el) => selectedIds.includes(el.id));
    if (selected.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of selected) {
      if (el.type === 'pen' && el.points) {
        for (const p of el.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      } else {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + Math.abs(el.width));
        maxY = Math.max(maxY, el.y + Math.abs(el.height));
      }
    }

    const pad = 8 / viewport.zoom;
    const x = minX - pad;
    const y = minY - pad;
    const w = (maxX - minX) + pad * 2;
    const h = (maxY - minY) + pad * 2;
    const lw = 1.5 / viewport.zoom;
    const dash = 5 / viewport.zoom;
    const handleSz = 8 / viewport.zoom;

    const { ctx } = this;
    ctx.save();

    // Dashed selection border
    ctx.strokeStyle = '#7c6af7';
    ctx.lineWidth = lw;
    ctx.setLineDash([dash, dash]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // 8 resize handles
    const handles = [
      [x,       y],
      [x + w/2, y],
      [x + w,   y],
      [x + w,   y + h/2],
      [x + w,   y + h],
      [x + w/2, y + h],
      [x,       y + h],
      [x,       y + h/2],
    ] as [number, number][];

    for (const [hx, hy] of handles) {
      ctx.fillStyle = '#0d0d18';
      ctx.strokeStyle = '#7c6af7';
      ctx.lineWidth = lw;
      ctx.fillRect(hx - handleSz / 2, hy - handleSz / 2, handleSz, handleSz);
      ctx.strokeRect(hx - handleSz / 2, hy - handleSz / 2, handleSz, handleSz);
    }

    ctx.restore();
  }

  renderSelectionRect(rect: Rect): void {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = '#7c6af7';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillStyle = 'rgba(124, 106, 247, 0.06)';
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ─── Shape renderers ──────────────────────────────────────────────────────

  private renderPen(el: CanvasElement): void {
    if (!el.points || el.points.length < 2) return;
    const { ctx } = this;
    ctx.beginPath();
    drawCatmullRom(ctx, el.points);
    ctx.stroke();
  }

  private roughOpts(el: CanvasElement) {
    return {
      roughness: 1.4,
      bowing: 0.8,
      seed: el.roughSeed,
      stroke: el.color,
      strokeWidth: el.strokeWidth,
      disableMultiStroke: false,
    };
  }

  // Memoized Rough.js rendering for committed elements
  private renderShapeRough(el: CanvasElement): void {
    const key = `${el.id}-${el.version}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let drawable: any = this.drawableCache.get(key);

    if (!drawable) {
      drawable = this.generateDrawable(el);
      // Evict old versions of same element
      for (const k of this.drawableCache.keys()) {
        if (k.startsWith(el.id + '-')) this.drawableCache.delete(k);
      }
      this.drawableCache.set(key, drawable);
      // Cap cache size
      if (this.drawableCache.size > 400) {
        const oldest = this.drawableCache.keys().next().value as string;
        this.drawableCache.delete(oldest);
      }
    }

    if (drawable) {
      this.rc.draw(drawable);
      if (el.type === 'arrow') this.renderArrowHead(el);
    }
  }

  // Immediate (uncached) Rough.js render for previews
  private renderShapeImmediate(el: CanvasElement): void {
    const d = this.generateDrawable(el);
    if (d) {
      this.rc.draw(d);
      if (el.type === 'arrow') this.renderArrowHead(el);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateDrawable(el: CanvasElement): any {
    const opts = this.roughOpts(el);
    switch (el.type) {
      case 'rect':
        return this.generator.rectangle(el.x, el.y, el.width, el.height, opts);
      case 'ellipse':
        return this.generator.ellipse(
          el.x + el.width / 2,
          el.y + el.height / 2,
          Math.abs(el.width),
          Math.abs(el.height),
          opts
        );
      case 'line':
      case 'arrow':
        return this.generator.line(
          el.x, el.y,
          el.x + el.width, el.y + el.height,
          opts
        );
      default:
        return null;
    }
  }

  private renderArrowHead(el: CanvasElement): void {
    const { ctx } = this;
    const x1 = el.x, y1 = el.y;
    const x2 = el.x + el.width, y2 = el.y + el.height;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(12, el.strokeWidth * 5);

    ctx.save();
    ctx.strokeStyle = el.color;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
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
    ctx.restore();
  }

  private renderText(el: CanvasElement): void {
    if (!el.text) return;
    const { ctx } = this;
    const fontSize = Math.max(14, el.strokeWidth * 7);
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = el.color;
    ctx.fillText(el.text, el.x, el.y);
  }
}
