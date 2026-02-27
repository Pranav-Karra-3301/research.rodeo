import { create } from "zustand";
import { nanoid } from "nanoid";

export interface TimelineEvent {
  id: string;
  timestamp: number;
  type:
    | "search"
    | "add-node"
    | "expand"
    | "archive"
    | "note"
    | "cluster"
    | "navigate";
  summary: string;
  nodeId?: string;
  metadata?: Record<string, unknown>;
}

const MAX_EVENTS = 500;
const LS_KEY = "rh_timeline_events";

function loadEvents(): TimelineEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as TimelineEvent[];
  } catch {
    // ignore parse errors
  }
  return [];
}

function saveEvents(events: TimelineEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(events));
  } catch {
    // ignore storage errors
  }
}

interface TimelineState {
  events: TimelineEvent[];
  addEvent: (event: Omit<TimelineEvent, "id" | "timestamp">) => void;
  clearEvents: () => void;
  getRecentEvents: (limit?: number) => TimelineEvent[];
}

export const useTimelineStore = create<TimelineState>()((set, get) => ({
  events: loadEvents(),

  addEvent: (partial) => {
    const event: TimelineEvent = {
      ...partial,
      id: nanoid(10),
      timestamp: Date.now(),
    };
    set((state) => {
      const events = [event, ...state.events].slice(0, MAX_EVENTS);
      saveEvents(events);
      return { events };
    });
  },

  clearEvents: () => {
    set({ events: [] });
    saveEvents([]);
  },

  getRecentEvents: (limit = 50) => {
    return get().events.slice(0, limit);
  },
}));
