"use client";

import { nanoid } from "nanoid";
import type { UIMessage } from "ai";
import type { ChatMessageRecord, ChatThread } from "@/types";
import { useChatStore } from "@/store/chat-store";
import { useRabbitHoleStore } from "@/store/rabbit-hole-store";

function getConn() {
  return useRabbitHoleStore.getState().dbConnection;
}

function getHoleId() {
  return useRabbitHoleStore.getState().currentRabbitHoleId;
}

function now() {
  return Date.now();
}

export function createChatThread(args?: {
  rabbitHoleId?: string;
  threadId?: string;
  title?: string;
}): ChatThread | null {
  const rabbitHoleId = args?.rabbitHoleId ?? getHoleId();
  if (!rabbitHoleId) return null;

  const thread: ChatThread = {
    id: args?.threadId ?? `thread-${nanoid(10)}`,
    rabbitHoleId,
    title: args?.title,
    createdAt: now(),
    updatedAt: now(),
    nextSeq: 0,
  };

  const store = useChatStore.getState();
  store.upsertThread(thread);
  store.setActiveThread(rabbitHoleId, thread.id);

  const conn = getConn();
  if (conn) {
    conn.reducers.createChatThread({
      rabbitHoleId,
      threadId: thread.id,
      title: thread.title ?? undefined,
    });
  }

  return thread;
}

export function renameChatThread(
  threadId: string,
  title: string | undefined,
  rabbitHoleId?: string
): void {
  const holeId = rabbitHoleId ?? getHoleId();
  if (!holeId) return;

  const hole = useChatStore.getState().byHole[holeId];
  const thread = hole?.threads.find((t) => t.id === threadId);
  if (thread) {
    useChatStore.getState().upsertThread({
      ...thread,
      title,
      updatedAt: now(),
    });
  }

  const conn = getConn();
  if (conn) {
    conn.reducers.renameChatThread({
      rabbitHoleId: holeId,
      threadId,
      title: title ?? undefined,
    });
  }
}

export function deleteChatThread(threadId: string, rabbitHoleId?: string): void {
  const holeId = rabbitHoleId ?? getHoleId();
  if (!holeId) return;

  useChatStore.getState().removeThread(holeId, threadId);

  const conn = getConn();
  if (conn) {
    conn.reducers.deleteChatThread({
      rabbitHoleId: holeId,
      threadId,
    });
  }
}

export function upsertChatMessage(args: {
  threadId: string;
  message: UIMessage;
  seq?: number;
  rabbitHoleId?: string;
}): ChatMessageRecord | null {
  const rabbitHoleId = args.rabbitHoleId ?? getHoleId();
  if (!rabbitHoleId) return null;

  const store = useChatStore.getState();
  const existing =
    store.byHole[rabbitHoleId]?.messagesByThread[args.threadId]?.find(
      (m) => m.id === args.message.id
    ) ?? null;
  const thread =
    store.byHole[rabbitHoleId]?.threads.find((t) => t.id === args.threadId) ??
    null;

  const assignedSeq =
    args.seq ??
    existing?.seq ??
    thread?.nextSeq ??
    (store.byHole[rabbitHoleId]?.messagesByThread[args.threadId]?.length ?? 0);

  const messageJson = JSON.stringify(args.message);
  if (
    existing &&
    existing.threadId === args.threadId &&
    existing.rabbitHoleId === rabbitHoleId &&
    existing.seq === assignedSeq &&
    existing.role === args.message.role &&
    existing.messageJson === messageJson
  ) {
    return existing;
  }

  const record: ChatMessageRecord = {
    id: args.message.id,
    rabbitHoleId,
    threadId: args.threadId,
    seq: assignedSeq,
    role: args.message.role,
    messageJson,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  };

  store.upsertMessage(record);

  const conn = getConn();
  if (conn) {
    conn.reducers.upsertChatMessage({
      rabbitHoleId,
      threadId: args.threadId,
      messageId: record.id,
      role: record.role,
      messageJson: record.messageJson,
      seq: BigInt(record.seq),
    });
  }

  return record;
}

export function parseChatMessage(record: ChatMessageRecord): UIMessage | null {
  try {
    return JSON.parse(record.messageJson) as UIMessage;
  } catch {
    return null;
  }
}
