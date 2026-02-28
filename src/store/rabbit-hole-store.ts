"use client";

import { create } from "zustand";
import { nanoid } from "nanoid";
import type { DbConnection } from "@/lib/spacetimedb";

export type RabbitHoleVisibility = "private" | "public";

export interface RabbitHole {
  id: string;
  name: string;
  rootQuery?: string;
  ownerId?: string;       // Auth0 user sub
  visibility: RabbitHoleVisibility;
  createdAt: number; // ms
  updatedAt: number; // ms
}

interface RabbitHoleState {
  rabbitHoles: RabbitHole[];
  currentRabbitHoleId: string | null;
  isDbConnected: boolean;
  /** The live SpacetimeDB connection – set by the provider once connected. */
  dbConnection: DbConnection | null;

  // Actions
  setRabbitHoles: (holes: RabbitHole[]) => void;
  upsertRabbitHole: (hole: RabbitHole) => void;
  removeRabbitHole: (id: string) => void;
  setCurrentRabbitHoleId: (id: string | null) => void;
  setDbConnected: (connected: boolean) => void;
  setDbConnection: (conn: DbConnection | null) => void;

  // Derived
  getCurrentRabbitHole: () => RabbitHole | undefined;
}

export const useRabbitHoleStore = create<RabbitHoleState>()((set, get) => ({
  rabbitHoles: [],
  currentRabbitHoleId: null,
  isDbConnected: false,
  dbConnection: null,

  setRabbitHoles: (holes) => set({ rabbitHoles: holes }),

  upsertRabbitHole: (hole) =>
    set((state) => {
      const idx = state.rabbitHoles.findIndex((h) => h.id === hole.id);
      if (idx >= 0) {
        const updated = [...state.rabbitHoles];
        updated[idx] = hole;
        return { rabbitHoles: updated };
      }
      return { rabbitHoles: [...state.rabbitHoles, hole] };
    }),

  removeRabbitHole: (id) =>
    set((state) => ({
      rabbitHoles: state.rabbitHoles.filter((h) => h.id !== id),
      currentRabbitHoleId:
        state.currentRabbitHoleId === id ? null : state.currentRabbitHoleId,
    })),

  setCurrentRabbitHoleId: (id) => set({ currentRabbitHoleId: id }),

  setDbConnected: (connected) => set({ isDbConnected: connected }),

  setDbConnection: (conn) => set({ dbConnection: conn }),

  getCurrentRabbitHole: () => {
    const { currentRabbitHoleId, rabbitHoles } = get();
    return currentRabbitHoleId
      ? rabbitHoles.find((h) => h.id === currentRabbitHoleId)
      : undefined;
  },
}));

/** Generate a new rabbit hole ID */
export function newRabbitHoleId(): string {
  return nanoid(10);
}
