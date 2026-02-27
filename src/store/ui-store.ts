import { create } from "zustand";

type RightPanel = "reader" | "export" | "frontier" | "timeline" | null;
type CurrentView = "graph" | "list" | "chat";
type ChatInputMode = "chat" | "search";

interface UIState {
  rightPanel: RightPanel;
  chatDockOpen: boolean;
  leftSidebarOpen: boolean;
  paperListOpen: boolean;
  searchOpen: boolean;
  weightsPanelOpen: boolean;
  addSourceOpen: boolean;
  addSourceInitialUrl: string | null;
  currentView: CurrentView;
  chatInputMode: ChatInputMode;
  contextMenuPosition: { x: number; y: number } | null;

  // Actions
  setRightPanel: (panel: RightPanel) => void;
  toggleRightPanel: (panel: RightPanel) => void;
  setChatDockOpen: (open: boolean) => void;
  toggleChatDock: () => void;
  toggleLeftSidebar: () => void;
  togglePaperList: () => void;
  toggleSearch: () => void;
  toggleWeights: () => void;
  openAddSource: (initialUrl?: string) => void;
  closeAddSource: () => void;
  setCurrentView: (view: CurrentView) => void;
  setChatInputMode: (mode: ChatInputMode) => void;
  setContextMenuPosition: (pos: { x: number; y: number } | null) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  rightPanel: null,
  chatDockOpen: false,
  leftSidebarOpen: true,
  paperListOpen: true,
  searchOpen: false,
  weightsPanelOpen: false,
  addSourceOpen: false,
  addSourceInitialUrl: null,
  currentView: "graph",
  chatInputMode: "chat",
  contextMenuPosition: null,

  setRightPanel: (panel) => set({ rightPanel: panel }),
  toggleRightPanel: (panel) =>
    set((state) => ({
      rightPanel: state.rightPanel === panel ? null : panel,
    })),

  setChatDockOpen: (open) => set({ chatDockOpen: open }),
  toggleChatDock: () => set((state) => ({ chatDockOpen: !state.chatDockOpen })),

  toggleLeftSidebar: () =>
    set((state) => ({ leftSidebarOpen: !state.leftSidebarOpen })),

  togglePaperList: () =>
    set((state) => ({ paperListOpen: !state.paperListOpen })),

  toggleSearch: () =>
    set((state) => ({ searchOpen: !state.searchOpen })),

  toggleWeights: () =>
    set((state) => ({ weightsPanelOpen: !state.weightsPanelOpen })),

  openAddSource: (initialUrl) =>
    set({
      addSourceOpen: true,
      addSourceInitialUrl: initialUrl ?? null,
    }),
  closeAddSource: () =>
    set({ addSourceOpen: false, addSourceInitialUrl: null }),

  setCurrentView: (view) => set({ currentView: view }),
  setChatInputMode: (mode) => set({ chatInputMode: mode }),

  setContextMenuPosition: (pos) => set({ contextMenuPosition: pos }),
}));

export type { CurrentView, ChatInputMode };
