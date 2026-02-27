"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppliedChangeEvent } from "@/types";

interface RabbitHoleWorkflowSnapshot {
  question: string;
  appliedChanges: AppliedChangeEvent[];
}

interface WorkflowState {
  activeRabbitHoleId: string | null;
  byHole: Record<string, RabbitHoleWorkflowSnapshot>;

  setActiveRabbitHole: (rabbitHoleId: string | null) => void;
  setQuestion: (question: string) => void;
  addAppliedChange: (event: AppliedChangeEvent) => void;
  resetCurrentWorkflow: () => void;
  getCurrentWorkflow: () => RabbitHoleWorkflowSnapshot;
}

function newSnapshot(question = ""): RabbitHoleWorkflowSnapshot {
  return {
    question,
    appliedChanges: [],
  };
}

export const EMPTY_WORKFLOW_SNAPSHOT: RabbitHoleWorkflowSnapshot = newSnapshot();

function withCurrent(
  state: WorkflowState,
  mutator: (current: RabbitHoleWorkflowSnapshot) => RabbitHoleWorkflowSnapshot
) {
  const holeId = state.activeRabbitHoleId;
  if (!holeId) return state.byHole;
  const current = state.byHole[holeId] ?? newSnapshot();
  return {
    ...state.byHole,
    [holeId]: mutator(current),
  };
}

export const useWorkflowStore = create<WorkflowState>()(
  persist(
    (set, get) => ({
      activeRabbitHoleId: null,
      byHole: {},

      setActiveRabbitHole: (rabbitHoleId) =>
        set((state) => {
          if (!rabbitHoleId) {
            return { activeRabbitHoleId: null };
          }
          if (state.byHole[rabbitHoleId]) {
            return { activeRabbitHoleId: rabbitHoleId };
          }
          return {
            activeRabbitHoleId: rabbitHoleId,
            byHole: {
              ...state.byHole,
              [rabbitHoleId]: newSnapshot(),
            },
          };
        }),

      setQuestion: (question) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            question,
          })),
        })),

      addAppliedChange: (event) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            appliedChanges: [event, ...current.appliedChanges].slice(0, 200),
          })),
        })),

      resetCurrentWorkflow: () =>
        set((state) => {
          const holeId = state.activeRabbitHoleId;
          if (!holeId) return state;
          return {
            byHole: {
              ...state.byHole,
              [holeId]: newSnapshot(state.byHole[holeId]?.question ?? ""),
            },
          };
        }),

      getCurrentWorkflow: () => {
        const state = get();
        if (!state.activeRabbitHoleId) return EMPTY_WORKFLOW_SNAPSHOT;
        return state.byHole[state.activeRabbitHoleId] ?? EMPTY_WORKFLOW_SNAPSHOT;
      },
    }),
    {
      name: "research-rodeo-workflow",
      partialize: (state) => ({
        byHole: state.byHole,
      }),
    }
  )
);

export type { RabbitHoleWorkflowSnapshot };
