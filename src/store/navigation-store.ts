import { create } from "zustand";

interface NavigationState {
  focusNodeId: string | null;
  previousFocusNodeId: string | null;
  hopDistances: Map<string, number>;
  maxVisibleHops: number;
  transitionInProgress: boolean;
  setFocus: (nodeId: string | null) => void;
  goBack: () => void;
  setHopDistances: (distances: Map<string, number>) => void;
  setMaxVisibleHops: (hops: number) => void;
  setTransitioning: (v: boolean) => void;
}

export const useNavigationStore = create<NavigationState>()((set, get) => ({
  focusNodeId: null,
  previousFocusNodeId: null,
  hopDistances: new Map(),
  maxVisibleHops: 3,
  transitionInProgress: false,
  setFocus: (nodeId) => set((state) => ({
    previousFocusNodeId: state.focusNodeId,
    focusNodeId: nodeId,
  })),
  goBack: () => set((state) => ({
    focusNodeId: state.previousFocusNodeId,
    previousFocusNodeId: null,
  })),
  setHopDistances: (distances) => set({ hopDistances: distances }),
  setMaxVisibleHops: (hops) => set({ maxVisibleHops: hops }),
  setTransitioning: (v) => set({ transitionInProgress: v }),
}));
