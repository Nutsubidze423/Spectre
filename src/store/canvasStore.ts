import { create } from 'zustand';
import type { CanvasElement, Tool, Viewport, Rect } from '../types';

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
  setElements: (elements: CanvasElement[]) => void;

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

  // AI assistant
  aiRegion: Rect | null;
  setAiRegion: (rect: Rect | null) => void;

  // UI panels
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  thinkingPartnerOpen: boolean;
  setThinkingPartnerOpen: (open: boolean) => void;

  // Challenge
  challengeIds: string[];
  addChallengeIds: (ids: string[]) => void;
  acceptAllChallenges: () => void;
  dismissAllChallenges: () => void;

  // Memory panel
  memoryPanelOpen: boolean;
  setMemoryPanelOpen: (open: boolean) => void;

  // Replay
  replayMode: boolean;
  setReplayMode: (mode: boolean) => void;
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
  aiRegion: null,
  shortcutsOpen: false,
  searchOpen: false,
  thinkingPartnerOpen: false,
  challengeIds: [],
  memoryPanelOpen: false,
  replayMode: false,

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

  setElements: (elements) =>
    set({ elements, past: [], future: [], selectedIds: [] }),

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

  aiRegion: null,
  setAiRegion: (rect) => set({ aiRegion: rect }),

  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setThinkingPartnerOpen: (open) => set({ thinkingPartnerOpen: open }),

  addChallengeIds: (ids) => set((s) => ({ challengeIds: [...s.challengeIds, ...ids] })),
  acceptAllChallenges: () => set({ challengeIds: [] }),
  dismissAllChallenges: () =>
    set((s) => ({
      elements: s.elements.filter((el) => !s.challengeIds.includes(el.id)),
      selectedIds: s.selectedIds.filter((id) => !s.challengeIds.includes(id)),
      challengeIds: [],
    })),

  setMemoryPanelOpen: (open) => set({ memoryPanelOpen: open }),
  setReplayMode: (mode) => set({ replayMode: mode }),
}));
