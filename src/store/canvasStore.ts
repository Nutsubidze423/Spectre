import { create } from 'zustand';
import type { CanvasElement, Tool, Viewport } from '../types';

interface CanvasState {
  elements: CanvasElement[];
  selectedIds: string[];
  activeTool: Tool;
  color: string;
  strokeWidth: number;
  opacity: number;
  viewport: Viewport;

  addElement: (element: CanvasElement) => void;
  updateElement: (id: string, changes: Partial<CanvasElement>) => void;
  deleteElements: (ids: string[]) => void;
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

  addElement: (element) =>
    set((state) => ({ elements: [...state.elements, element] })),

  updateElement: (id, changes) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, ...changes, version: el.version + 1 } : el
      ),
    })),

  deleteElements: (ids) =>
    set((state) => ({
      elements: state.elements.filter((el) => !ids.includes(el.id)),
      selectedIds: state.selectedIds.filter((id) => !ids.includes(id)),
    })),

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  setActiveTool: (tool) => set({ activeTool: tool }),
  setColor: (color) => set({ color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setOpacity: (opacity) => set({ opacity }),
  setViewport: (viewport) => set({ viewport }),
  clearCanvas: () => set({ elements: [], selectedIds: [] }),
}));
