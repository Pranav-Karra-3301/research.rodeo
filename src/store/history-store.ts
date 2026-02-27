import { create } from "zustand";

const MAX_HISTORY = 50;

export interface HistoryEntry {
  description: string;
  undo: () => void;
  redo: () => void;
}

interface HistoryState {
  past: HistoryEntry[];
  future: HistoryEntry[];
  push: (entry: HistoryEntry) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>()((set, get) => ({
  past: [],
  future: [],

  push: (entry) =>
    set((state) => ({
      past: [...state.past.slice(-MAX_HISTORY + 1), entry],
      future: [],
    })),

  undo: () => {
    const { past, future } = get();
    if (past.length === 0) return;
    const entry = past[past.length - 1];
    entry.undo();
    set({
      past: past.slice(0, -1),
      future: [...future, entry],
    });
  },

  redo: () => {
    const { past, future } = get();
    if (future.length === 0) return;
    const entry = future[future.length - 1];
    entry.redo();
    set({
      past: [...past, entry],
      future: future.slice(0, -1),
    });
  },

  canUndo: () => get().past.length > 0,

  canRedo: () => get().future.length > 0,

  clear: () => set({ past: [], future: [] }),
}));
