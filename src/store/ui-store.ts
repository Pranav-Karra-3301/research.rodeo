import { create } from "zustand";
import type { ZoomLevel } from "@/lib/visual/zoom-levels";

interface UIState {
  searchOpen: boolean;
  rightPanel: string | null;
  currentZoomLevel: ZoomLevel;
  contextMenuPosition: { x: number; y: number } | null;
  toggleSearch: () => void;
  setRightPanel: (panel: string | null) => void;
  setCurrentZoomLevel: (level: ZoomLevel) => void;
  setContextMenuPosition: (pos: { x: number; y: number } | null) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  searchOpen: false,
  rightPanel: null,
  currentZoomLevel: "medium",
  contextMenuPosition: null,
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen })),
  setRightPanel: (panel) => set({ rightPanel: panel }),
  setCurrentZoomLevel: (level) => set({ currentZoomLevel: level }),
  setContextMenuPosition: (pos) => set({ contextMenuPosition: pos }),
}));
