"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AppliedChangeEvent,
  EvidenceCard,
  EvidenceCardStatus,
  GraphCommandIntent,
  LayerStatus,
  RabbitHoleLayer,
  ScopeQuestion,
} from "@/types";

export type OnboardingStep =
  | "idle"
  | "scope_questions"
  | "evidence_loading"
  | "evidence_review"
  | "active_research";

interface PendingGraphAction {
  id: string;
  toolName: string;
  toolCallId: string;
  summary: string;
  intent: GraphCommandIntent;
}

interface RabbitHoleWorkflowSnapshot {
  question: string;
  onboardingStep: OnboardingStep;
  scopeQuestions: ScopeQuestion[];
  scopeAnswers: Record<string, string>;
  layerStatus: Record<RabbitHoleLayer, LayerStatus>;
  evidenceCards: EvidenceCard[];
  pendingActions: PendingGraphAction[];
  appliedChanges: AppliedChangeEvent[];
}

interface WorkflowState {
  activeRabbitHoleId: string | null;
  byHole: Record<string, RabbitHoleWorkflowSnapshot>;

  setActiveRabbitHole: (rabbitHoleId: string | null) => void;
  setQuestion: (question: string) => void;
  setOnboardingStep: (step: OnboardingStep) => void;
  setScopeQuestions: (questions: ScopeQuestion[]) => void;
  setScopeAnswer: (questionId: string, answer: string) => void;
  setLayerStatus: (layer: RabbitHoleLayer, status: LayerStatus) => void;
  setEvidenceCards: (cards: EvidenceCard[]) => void;
  upsertEvidenceCards: (cards: EvidenceCard[]) => void;
  setEvidenceCardStatus: (cardId: string, status: EvidenceCardStatus) => void;
  setEvidenceCardLinkedNode: (cardId: string, nodeId: string) => void;
  addPendingAction: (action: PendingGraphAction) => void;
  removePendingAction: (actionId: string) => void;
  clearPendingActions: () => void;
  addAppliedChange: (event: AppliedChangeEvent) => void;
  resetCurrentWorkflow: () => void;
  getCurrentWorkflow: () => RabbitHoleWorkflowSnapshot;
}

const DEFAULT_LAYERS: Record<RabbitHoleLayer, LayerStatus> = {
  0: "pending",
  1: "pending",
  2: "pending",
  3: "pending",
};

function newSnapshot(question = ""): RabbitHoleWorkflowSnapshot {
  return {
    question,
    onboardingStep: "idle",
    scopeQuestions: [],
    scopeAnswers: {},
    layerStatus: { ...DEFAULT_LAYERS },
    evidenceCards: [],
    pendingActions: [],
    appliedChanges: [],
  };
}

export const EMPTY_WORKFLOW_SNAPSHOT: RabbitHoleWorkflowSnapshot = newSnapshot();

function withCurrent(
  state: WorkflowState,
  mutator: (current: RabbitHoleWorkflowSnapshot, holeId: string) => RabbitHoleWorkflowSnapshot
) {
  const holeId = state.activeRabbitHoleId;
  if (!holeId) return state.byHole;
  const current = state.byHole[holeId] ?? newSnapshot();
  return {
    ...state.byHole,
    [holeId]: mutator(current, holeId),
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
            layerStatus: {
              ...current.layerStatus,
              0: question.trim() ? "active" : current.layerStatus[0],
            },
          })),
        })),

      setOnboardingStep: (step) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            onboardingStep: step,
          })),
        })),

      setScopeQuestions: (questions) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            scopeQuestions: questions,
          })),
        })),

      setScopeAnswer: (questionId, answer) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            scopeAnswers: { ...current.scopeAnswers, [questionId]: answer },
          })),
        })),

      setLayerStatus: (layer, status) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            layerStatus: { ...current.layerStatus, [layer]: status },
          })),
        })),

      setEvidenceCards: (cards) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            evidenceCards: cards,
          })),
        })),

      upsertEvidenceCards: (cards) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => {
            const map = new Map(current.evidenceCards.map((c) => [c.id, c]));
            for (const card of cards) {
              const existing = map.get(card.id);
              map.set(card.id, existing ? { ...existing, ...card } : card);
            }
            return { ...current, evidenceCards: Array.from(map.values()) };
          }),
        })),

      setEvidenceCardStatus: (cardId, status) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            evidenceCards: current.evidenceCards.map((card) =>
              card.id === cardId
                ? { ...card, status, updatedAt: Date.now() }
                : card
            ),
          })),
        })),

      setEvidenceCardLinkedNode: (cardId, nodeId) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            evidenceCards: current.evidenceCards.map((card) =>
              card.id === cardId
                ? { ...card, linkedNodeId: nodeId, updatedAt: Date.now() }
                : card
            ),
          })),
        })),

      addPendingAction: (action) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            pendingActions: [action, ...current.pendingActions],
          })),
        })),

      removePendingAction: (actionId) =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            pendingActions: current.pendingActions.filter((a) => a.id !== actionId),
          })),
        })),

      clearPendingActions: () =>
        set((state) => ({
          byHole: withCurrent(state, (current) => ({
            ...current,
            pendingActions: [],
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

export type { PendingGraphAction, RabbitHoleWorkflowSnapshot };
