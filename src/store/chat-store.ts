"use client";

import { create } from "zustand";
import type { ChatMessageRecord, ChatThread } from "@/types";

interface HoleChatState {
  threads: ChatThread[];
  activeThreadId: string | null;
  messagesByThread: Record<string, ChatMessageRecord[]>;
  draftsByThread: Record<string, string>;
}

interface ChatStoreState {
  byHole: Record<string, HoleChatState>;

  hydrateHole: (args: {
    rabbitHoleId: string;
    threads: ChatThread[];
    messages: ChatMessageRecord[];
    preferredActiveThreadId?: string | null;
  }) => void;
  upsertThread: (thread: ChatThread) => void;
  removeThread: (rabbitHoleId: string, threadId: string) => void;
  setActiveThread: (rabbitHoleId: string, threadId: string | null) => void;
  upsertMessage: (message: ChatMessageRecord) => void;
  removeMessage: (rabbitHoleId: string, threadId: string, messageId: string) => void;
  setDraft: (rabbitHoleId: string, threadId: string, draft: string) => void;
  getDraft: (rabbitHoleId: string, threadId: string) => string;
  clearHole: (rabbitHoleId: string) => void;
}

function emptyHoleState(): HoleChatState {
  return {
    threads: [],
    activeThreadId: null,
    messagesByThread: {},
    draftsByThread: {},
  };
}

function sortThreads(threads: ChatThread[]): ChatThread[] {
  return [...threads].sort((a, b) => b.updatedAt - a.updatedAt);
}

function sortMessages(messages: ChatMessageRecord[]): ChatMessageRecord[] {
  return [...messages].sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
    return a.id.localeCompare(b.id);
  });
}

export const useChatStore = create<ChatStoreState>()((set, get) => ({
  byHole: {},

  hydrateHole: ({ rabbitHoleId, threads, messages, preferredActiveThreadId }) =>
    set((state) => {
      const grouped: Record<string, ChatMessageRecord[]> = {};
      for (const msg of messages) {
        grouped[msg.threadId] = grouped[msg.threadId]
          ? [...grouped[msg.threadId], msg]
          : [msg];
      }
      for (const threadId of Object.keys(grouped)) {
        grouped[threadId] = sortMessages(grouped[threadId]);
      }

      const sortedThreads = sortThreads(threads);
      const previous = state.byHole[rabbitHoleId] ?? emptyHoleState();
      const preferred = preferredActiveThreadId ?? previous.activeThreadId;
      const activeThreadId =
        (preferred && sortedThreads.some((t) => t.id === preferred) ? preferred : null) ??
        sortedThreads[0]?.id ??
        null;

      return {
        byHole: {
          ...state.byHole,
          [rabbitHoleId]: {
            threads: sortedThreads,
            activeThreadId,
            messagesByThread: grouped,
            draftsByThread: previous.draftsByThread,
          },
        },
      };
    }),

  upsertThread: (thread) =>
    set((state) => {
      const hole = state.byHole[thread.rabbitHoleId] ?? emptyHoleState();
      const idx = hole.threads.findIndex((t) => t.id === thread.id);
      const threads =
        idx >= 0
          ? hole.threads.map((t) => (t.id === thread.id ? thread : t))
          : [...hole.threads, thread];

      const sorted = sortThreads(threads);
      const activeThreadId =
        hole.activeThreadId && sorted.some((t) => t.id === hole.activeThreadId)
          ? hole.activeThreadId
          : thread.id;

      return {
        byHole: {
          ...state.byHole,
          [thread.rabbitHoleId]: {
            ...hole,
            threads: sorted,
            activeThreadId,
          },
        },
      };
    }),

  removeThread: (rabbitHoleId, threadId) =>
    set((state) => {
      const hole = state.byHole[rabbitHoleId] ?? emptyHoleState();
      const threads = hole.threads.filter((t) => t.id !== threadId);
      const messagesByThread = { ...hole.messagesByThread };
      delete messagesByThread[threadId];
      const draftsByThread = { ...hole.draftsByThread };
      delete draftsByThread[threadId];
      const activeThreadId =
        hole.activeThreadId === threadId
          ? (threads[0]?.id ?? null)
          : hole.activeThreadId;

      return {
        byHole: {
          ...state.byHole,
          [rabbitHoleId]: {
            threads,
            activeThreadId,
            messagesByThread,
            draftsByThread,
          },
        },
      };
    }),

  setActiveThread: (rabbitHoleId, threadId) =>
    set((state) => {
      const hole = state.byHole[rabbitHoleId] ?? emptyHoleState();
      return {
        byHole: {
          ...state.byHole,
          [rabbitHoleId]: {
            ...hole,
            activeThreadId: threadId,
          },
        },
      };
    }),

  upsertMessage: (message) =>
    set((state) => {
      const hole = state.byHole[message.rabbitHoleId] ?? emptyHoleState();
      const threadMessages = hole.messagesByThread[message.threadId] ?? [];
      const idx = threadMessages.findIndex((m) => m.id === message.id);
      const nextThreadMessages =
        idx >= 0
          ? threadMessages.map((m) => (m.id === message.id ? message : m))
          : [...threadMessages, message];

      const nextThreads = hole.threads.map((t) =>
        t.id === message.threadId
          ? {
              ...t,
              updatedAt: Math.max(t.updatedAt, message.updatedAt),
              nextSeq: Math.max(t.nextSeq, message.seq + 1),
            }
          : t
      );

      return {
        byHole: {
          ...state.byHole,
          [message.rabbitHoleId]: {
            ...hole,
            threads: sortThreads(nextThreads),
            messagesByThread: {
              ...hole.messagesByThread,
              [message.threadId]: sortMessages(nextThreadMessages),
            },
          },
        },
      };
    }),

  removeMessage: (rabbitHoleId, threadId, messageId) =>
    set((state) => {
      const hole = state.byHole[rabbitHoleId] ?? emptyHoleState();
      const threadMessages = hole.messagesByThread[threadId] ?? [];
      return {
        byHole: {
          ...state.byHole,
          [rabbitHoleId]: {
            ...hole,
            messagesByThread: {
              ...hole.messagesByThread,
              [threadId]: threadMessages.filter((m) => m.id !== messageId),
            },
          },
        },
      };
    }),

  setDraft: (rabbitHoleId, threadId, draft) =>
    set((state) => {
      const hole = state.byHole[rabbitHoleId] ?? emptyHoleState();
      return {
        byHole: {
          ...state.byHole,
          [rabbitHoleId]: {
            ...hole,
            draftsByThread: {
              ...hole.draftsByThread,
              [threadId]: draft,
            },
          },
        },
      };
    }),

  getDraft: (rabbitHoleId, threadId) => {
    const hole = get().byHole[rabbitHoleId];
    return hole?.draftsByThread[threadId] ?? "";
  },

  clearHole: (rabbitHoleId) =>
    set((state) => ({
      byHole: {
        ...state.byHole,
        [rabbitHoleId]: emptyHoleState(),
      },
    })),
}));
