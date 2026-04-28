// ─── Canvas primitives ────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Viewport {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// ─── Tool types ───────────────────────────────────────────────────────────────

export type Tool =
  | 'select'
  | 'pen'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'eraser'
  | 'ai-select';

// ─── Canvas element ───────────────────────────────────────────────────────────

export type ElementType = 'pen' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'ai';

export interface RoughOptions {
  roughness?: number;
  bowing?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  fillStyle?: string;
  seed?: number;
}

export interface CanvasElement {
  id: string;
  type: ElementType;
  // Pen strokes: list of control points
  points?: Point[];
  // Shapes / text: bounding box
  x: number;
  y: number;
  width: number;
  height: number;
  // Text tool
  text?: string;
  // Styling
  color: string;
  strokeWidth: number;
  opacity: number;
  // Rough.js — fixed seed per element so shape doesn't re-sketch on re-render
  roughSeed: number;
  roughOptions?: RoughOptions;
  // Provenance
  createdBy: string;
  createdAt: number;
  version: number;
}

// ─── Tool event (InputHandler → tool classes) ─────────────────────────────────

export type ToolEventType = 'start' | 'move' | 'end';

export interface ToolEvent {
  type: ToolEventType;
  canvasPoint: Point;
  screenPoint: Point;
  shiftKey: boolean;
  ctrlKey: boolean;
}

// ─── Tool interface ───────────────────────────────────────────────────────────

export interface ITool {
  onEvent(event: ToolEvent): void;
  cancel(): void;
}

// ─── Multiplayer ──────────────────────────────────────────────────────────────

export interface RemoteUser {
  id: string;
  username: string;
  color: string;
  cursor?: Point;
  isGhost?: boolean;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
}

// ─── Auth + boards ────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export interface Board {
  id: string;
  name: string;
  thumbnailUrl?: string;
  isPublic: boolean;
  shareToken: string;
  createdAt: string;
  updatedAt: string;
}

export type AppView = 'loading' | 'auth' | 'boards' | 'canvas' | 'pricing' | 'account';

// ─── AI assistant ─────────────────────────────────────────────────────────────

export interface AIDrawRequest {
  prompt: string;
  canvasRegion: string;
  regionBounds: Rect;
  existingElementTypes: string[];
}

export interface AIDrawResponse {
  elements: Omit<CanvasElement, 'id' | 'createdBy' | 'createdAt' | 'version' | 'roughSeed'>[];
}
