import type { CanvasElement, ElementType, Rect } from '../types';

const VALID_TYPES = new Set<ElementType>(['pen', 'rect', 'ellipse', 'line', 'arrow', 'text']);

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && isFinite(v) ? v : fallback;
}

export function wireToElement(wire: Record<string, unknown>, region: Rect, createdBy: string): CanvasElement {
  const type: ElementType = VALID_TYPES.has(wire.type as ElementType)
    ? (wire.type as ElementType)
    : 'rect';

  return {
    id: crypto.randomUUID(),
    type,
    x: num(wire.x, region.x),
    y: num(wire.y, region.y),
    width: num(wire.width, 100),
    height: num(wire.height, 100),
    color: typeof wire.color === 'string' ? wire.color : '#e8e8f0',
    strokeWidth: num(wire.strokeWidth, 2),
    opacity: num(wire.opacity, 1),
    roughSeed: Math.floor(Math.random() * 2 ** 31),
    text: typeof wire.text === 'string' ? wire.text : undefined,
    points: Array.isArray(wire.points) ? wire.points as { x: number; y: number }[] : undefined,
    createdBy,
    createdAt: Date.now(),
    version: 0,
  };
}
