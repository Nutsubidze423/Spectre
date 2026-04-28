import { create } from 'zustand';
import type { Board } from '../types';
import { apiFetch } from '../api/client';

interface BoardState {
  boards: Board[];
  activeBoardId: string | null;
  isSaving: boolean;
  lastSavedAt: number | null;
  thumbnails: Record<string, string>;

  setBoards: (boards: Board[]) => void;
  addBoard: (board: Board) => void;
  removeBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;
  setActiveBoardId: (id: string | null) => void;
  setIsSaving: (v: boolean) => void;
  setThumbnail: (boardId: string, dataUrl: string) => void;

  fetchBoards: () => Promise<void>;
  createBoard: (name: string) => Promise<Board | null>;
  deleteBoard: (id: string) => Promise<void>;
  saveBoard: (id: string, elements: unknown[]) => Promise<void>;
  renameBoardRemote: (id: string, name: string) => Promise<void>;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  boards: [],
  activeBoardId: null,
  isSaving: false,
  lastSavedAt: null,
  thumbnails: {},

  setBoards: (boards) => set({ boards }),
  addBoard: (board) => set((s) => ({ boards: [board, ...s.boards] })),
  removeBoard: (id) => set((s) => ({ boards: s.boards.filter((b) => b.id !== id) })),
  renameBoard: (id, name) =>
    set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, name } : b)) })),
  setActiveBoardId: (id) => set({ activeBoardId: id }),
  setIsSaving: (v) => set({ isSaving: v }),
  setThumbnail: (boardId, dataUrl) =>
    set((s) => ({ thumbnails: { ...s.thumbnails, [boardId]: dataUrl } })),

  fetchBoards: async () => {
    try {
      const res = await apiFetch('/api/boards');
      if (!res.ok) return;
      const data = (await res.json()) as { boards: Board[] };
      set({ boards: data.boards });
    } catch {
      // silently fail
    }
  },

  createBoard: async (name) => {
    try {
      const res = await apiFetch('/api/boards', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { board: Board };
      get().addBoard(data.board);
      return data.board;
    } catch {
      return null;
    }
  },

  deleteBoard: async (id) => {
    try {
      await apiFetch(`/api/boards/${id}`, { method: 'DELETE' });
      get().removeBoard(id);
      if (get().activeBoardId === id) set({ activeBoardId: null });
    } catch {
      // silently fail
    }
  },

  saveBoard: async (id, elements) => {
    set({ isSaving: true });
    try {
      await apiFetch(`/api/boards/${id}/save`, {
        method: 'POST',
        body: JSON.stringify({ elements }),
      });
      set({ lastSavedAt: Date.now() });
    } catch {
      // silently fail
    } finally {
      set({ isSaving: false });
    }
  },

  renameBoardRemote: async (id, name) => {
    get().renameBoard(id, name);
    try {
      await apiFetch(`/api/boards/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    } catch {
      // silently fail — optimistic update stays
    }
  },
}));
