import { create } from 'zustand';
import type { CanvasElement, Tool, Viewport } from '../types';

const MAX_HISTORY = 50;

interface CanvasState {
  elements: CanvasElement[];
  selectedIds: string[];
  activeTool: Tool;
  color: string;
  strokeWidth: number;
  opacity: number;
  viewport: Viewport;

  // Undo/redo stacks
  past: CanvasElement[][];
  future: CanvasElement[][];

  // Element mutations
  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, changes: Partial<CanvasElement>) => void;
  deleteElements: (ids: string[]) => void;

  // Undo/redo
  pushSnapshot: () => void;
  undo: () => void;
  redo: () => void;

  // UI state
  setSelectedIds: (ids: string[]) => void;
  setActiveTool: (tool: Tool) => void;
  setColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setOpacity: (opacity: number) => void;
  setViewport: (viewport: Viewport) => void;
  clearCanvas: () => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  elements: [],
  selectedIds: [],
  activeTool: 'pen',
  color: '#e8e8f0',
  strokeWidth: 2,
  opacity: 1,
  viewport: { offsetX: 0, offsetY: 0, zoom: 1 },
  past: [],
  future: [],

  addElement: (element) =>
    set((s) => ({ elements: [...s.elements, element] })),

  updateElement: (id, changes) =>
    set((s) => ({
      elements: s.elements.map((el) =>
        el.id === id ? { ...el, ...changes, version: el.version + 1 } : el
      ),
    })),

  deleteElements: (ids) =>
    set((s) => ({
      elements: s.elements.filter((el) => !ids.includes(el.id)),
      selectedIds: s.selectedIds.filter((id) => !ids.includes(id)),
    })),

  pushSnapshot: () =>
    set((s) => ({
      past: [...s.past.slice(-(MAX_HISTORY - 1)), s.elements],
      future: [],
    })),

  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      const prev = s.past[s.past.length - 1];
      return {
        elements: prev,
        past: s.past.slice(0, -1),
        future: [s.elements, ...s.future.slice(0, MAX_HISTORY - 1)],
        selectedIds: [],
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      const next = s.future[0];
      return {
        elements: next,
        past: [...s.past.slice(-(MAX_HISTORY - 1)), s.elements],
        future: s.future.slice(1),
        selectedIds: [],
      };
    }),

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setOpacity: (opacity) => set({ opacity }),
  setViewport: (viewport) => set({ viewport }),
  clearCanvas: () => set({ elements: [], selectedIds: [], past: [], future: [] }),
}));
