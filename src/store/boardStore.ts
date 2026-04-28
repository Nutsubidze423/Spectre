import { create } from 'zustand';
import type { Board } from '../types';
import { apiFetch } from '../api/client';

interface BoardState {
  boards: Board[];
  activeBoardId: string | null;
  isSaving: boolean;

  setBoards: (boards: Board[]) => void;
  addBoard: (board: Board) => void;
  removeBoard: (id: string) => void;
  setActiveBoardId: (id: string | null) => void;
  setIsSaving: (v: boolean) => void;

  fetchBoards: () => Promise<void>;
  createBoard: (name: string) => Promise<Board | null>;
  deleteBoard: (id: string) => Promise<void>;
  saveBoard: (id: string, elements: unknown[]) => Promise<void>;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  boards: [],
  activeBoardId: null,
  isSaving: false,

  setBoards: (boards) => set({ boards }),
  addBoard: (board) => set((s) => ({ boards: [board, ...s.boards] })),
  removeBoard: (id) => set((s) => ({ boards: s.boards.filter((b) => b.id !== id) })),
  setActiveBoardId: (id) => set({ activeBoardId: id }),
  setIsSaving: (v) => set({ isSaving: v }),

  fetchBoards: async () => {
    try {
      const res = await apiFetch('/api/boards');
      if (!res.ok) return;
      const data = (await res.json()) as { boards: Board[] };
      set({ boards: data.boards });
    } catch {
      // silently fail — UI shows empty list
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
    } catch {
      // silently fail
    } finally {
      set({ isSaving: false });
    }
  },
}));
