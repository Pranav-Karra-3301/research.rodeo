"use client";

import { useEffect, useRef } from "react";
import { DbConnection, type SubscriptionHandle } from "@/lib/spacetimedb";
import { useRabbitHoleStore, type RabbitHole } from "@/store/rabbit-hole-store";
import { useGraphStore } from "@/store/graph-store";
import { useChatStore } from "@/store/chat-store";
import { parsePersistedNotes, flushPendingGraphWrites } from "@/lib/db/graph-actions";
import { fromDbNodeId } from "@/lib/db/node-id";
import { applySnapshotToStore, type GraphSnapshot } from "@/lib/graph/snapshot";
import type {
  PaperNode,
  GraphEdge,
  Cluster,
  NodeScores,
  NodeState,
  ChatThread,
  ChatMessageRecord,
} from "@/types";

const SPACETIMEDB_URI = process.env.NEXT_PUBLIC_SPACETIMEDB_URI ?? "wss://maincloud.spacetimedb.com";
const MODULE_NAME = process.env.NEXT_PUBLIC_SPACETIMEDB_DATABASE ?? "rabbit-hole-db";
const AUTH_TOKEN_KEY = `${SPACETIMEDB_URI}/${MODULE_NAME}/auth_token`;
const STDB_MAX_CONNECT_RETRIES = 5;
const STDB_RETRY_BASE_DELAY_MS = 800;

function parseConnectError(err: unknown): {
  message: string;
  shouldRetry: boolean;
  tokenInvalid: boolean;
} {
  const eventLike = err as {
    type?: unknown;
    target?: { readyState?: unknown };
    message?: unknown;
    reason?: unknown;
    code?: unknown;
  } | null;

  if (typeof eventLike?.message === "string" && eventLike.message.trim().length > 0) {
    const tokenInvalid = eventLike.message.includes("Failed to verify token");
    return {
      message: eventLike.message,
      shouldRetry: !tokenInvalid,
      tokenInvalid,
    };
  }

  if (typeof eventLike?.reason === "string" && eventLike.reason.trim().length > 0) {
    return { message: eventLike.reason, shouldRetry: true, tokenInvalid: false };
  }

  if (eventLike?.code != null && (typeof eventLike.code === "string" || typeof eventLike.code === "number")) {
    return { message: `code ${String(eventLike.code)}`, shouldRetry: true, tokenInvalid: false };
  }

  if (typeof eventLike?.type === "string") {
    const state = eventLike.target?.readyState;
    const readyState =
      state === 0
        ? "CONNECTING"
        : state === 1
          ? "OPEN"
          : state === 2
            ? "CLOSING"
            : state === 3
              ? "CLOSED"
              : "unknown";
    return {
      message: `WebSocket ${eventLike.type} event (readyState=${readyState})`,
      shouldRetry: true,
      tokenInvalid: false,
    };
  }

  if (err instanceof Error) {
    const message = err.message || err.name;
    const isConfigError =
      message.includes("Invalid URL") ||
      message.includes("URI is required") ||
      message.includes("Database name or address is required");
    return { message, shouldRetry: !isConfigError, tokenInvalid: false };
  }

  const fallback = err != null ? String(err) : "Unknown error";
  return {
    message: fallback,
    shouldRetry: fallback === "[object Event]" || fallback === "[object Object]" || fallback.length === 0,
    tokenInvalid: false,
  };
}

function safeUnsubscribe(handle: SubscriptionHandle | null, label: string): void {
  if (!handle) return;
  try {
    handle.unsubscribe();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Handle may already be ended/unsubscribed, especially during reconnect/disconnect races.
    console.warn(`[STDB] ${label}: unsubscribe skipped (${msg})`);
  }
}

/** Convert a SpacetimeDB node row to a PaperNode */
function rowToNode(row: {
  id: string;
  rabbitHoleId: string;
  dataJson: string;
  state: string;
  positionX: number;
  positionY: number;
  clusterId?: string;
  scoresJson: string;
  addedAt: bigint;
  expandedAt?: bigint;
  userNotes?: string;
}): PaperNode {
  const nodeId = fromDbNodeId(row.rabbitHoleId, row.id);
  let data = { id: nodeId, title: "", authors: [], citationCount: 0, referenceCount: 0, externalIds: {} };
  let scores: NodeScores = { relevance: 0, influence: 0, recency: 0, semanticSimilarity: 0, localCentrality: 0, velocity: 0 };
  try { data = JSON.parse(row.dataJson); } catch {}
  try { scores = JSON.parse(row.scoresJson); } catch {}

  const dataNotes =
    typeof (data as Record<string, unknown>)["_userNotes"] === "string"
      ? ((data as Record<string, unknown>)["_userNotes"] as string)
      : undefined;
  const parsedNotes = parsePersistedNotes(row.userNotes ?? dataNotes);

  return {
    id: nodeId,
    data,
    state: row.state as NodeState,
    position: { x: row.positionX, y: row.positionY },
    clusterId: row.clusterId ?? undefined,
    scores,
    addedAt: Number(row.addedAt),
    expandedAt: row.expandedAt != null ? Number(row.expandedAt) : undefined,
    userNotes: parsedNotes.notes || undefined,
    userTags: parsedNotes.tags.length > 0 ? parsedNotes.tags : undefined,
  };
}

/** Convert a SpacetimeDB edge row to a GraphEdge */
function rowToEdge(row: {
  id: string;
  rabbitHoleId: string;
  source: string;
  target: string;
  edgeType: string;
  trust: string;
  weight: number;
  evidence?: string;
  metadataJson?: string;
}): GraphEdge {
  return {
    id: row.id,
    source: fromDbNodeId(row.rabbitHoleId, row.source),
    target: fromDbNodeId(row.rabbitHoleId, row.target),
    type: row.edgeType as GraphEdge["type"],
    trust: row.trust as GraphEdge["trust"],
    weight: row.weight,
    evidence: row.evidence ?? undefined,
    metadata: row.metadataJson ? JSON.parse(row.metadataJson) : undefined,
  };
}

/** Convert a SpacetimeDB cluster row to a Cluster */
function rowToCluster(row: {
  id: string;
  rabbitHoleId: string;
  label: string;
  description?: string;
  nodeIdsJson: string;
  color?: string;
  centroidJson?: string;
}): Cluster {
  let nodeIds: string[] = [];
  let centroid: number[] | undefined;
  try { nodeIds = JSON.parse(row.nodeIdsJson); } catch {}
  nodeIds = nodeIds.map((nodeId) => fromDbNodeId(row.rabbitHoleId, nodeId));
  try {
    if (row.centroidJson) {
      const parsed = JSON.parse(row.centroidJson);
      // Stored as {x, y} from graph actions; convert to [x, y] for Cluster.centroid
      if (Array.isArray(parsed)) centroid = parsed;
      else if (parsed && typeof parsed.x === "number") centroid = [parsed.x, parsed.y];
    }
  } catch {}
  return {
    id: row.id,
    label: row.label,
    description: row.description ?? undefined,
    nodeIds,
    color: row.color ?? "#8b5cf6",
    centroid,
  };
}

/** Convert a SpacetimeDB chat_thread row to a ChatThread */
function rowToChatThread(row: {
  id: string;
  rabbitHoleId: string;
  title?: string;
  createdAt: bigint;
  updatedAt: bigint;
  nextSeq: bigint;
}): ChatThread {
  return {
    id: row.id,
    rabbitHoleId: row.rabbitHoleId,
    title: row.title ?? undefined,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    nextSeq: Number(row.nextSeq),
  };
}

/** Convert a SpacetimeDB chat_message row to a ChatMessageRecord */
function rowToChatMessage(row: {
  id: string;
  rabbitHoleId: string;
  threadId: string;
  seq: bigint;
  role: string;
  messageJson: string;
  createdAt: bigint;
  updatedAt: bigint;
}): ChatMessageRecord {
  return {
    id: row.id,
    rabbitHoleId: row.rabbitHoleId,
    threadId: row.threadId,
    seq: Number(row.seq),
    role: row.role,
    messageJson: row.messageJson,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
  };
}

export function SpacetimeDBProvider({ children }: { children: React.ReactNode }) {
  const connRef = useRef<DbConnection | null>(null);
  const connectingConnRef = useRef<DbConnection | null>(null);
  const connectingRef = useRef(false);
  const holeSubRef = useRef<SubscriptionHandle | null>(null);
  const rabbitHoleSubRef = useRef<SubscriptionHandle | null>(null);

  const setDbConnected = useRabbitHoleStore((s) => s.setDbConnected);
  const setDbConnection = useRabbitHoleStore((s) => s.setDbConnection);
  const dbConnection = useRabbitHoleStore((s) => s.dbConnection);
  const upsertRabbitHole = useRabbitHoleStore((s) => s.upsertRabbitHole);
  const removeRabbitHole = useRabbitHoleStore((s) => s.removeRabbitHole);
  const setCurrentRabbitHoleId = useRabbitHoleStore((s) => s.setCurrentRabbitHoleId);
  const currentRabbitHoleId = useRabbitHoleStore((s) => s.currentRabbitHoleId);

  const graphStore = useGraphStore;
  const chatStore = useChatStore;

  // Tracks which hole's graph was loaded from R2 in this render cycle.
  // Used to avoid STDB overwriting an R2-hydrated graph in onApplied.
  const r2LoadedForHoleRef = useRef<string | null>(null);

  // Load graph from R2 whenever the active rabbit hole changes.
  useEffect(() => {
    if (!currentRabbitHoleId) return;

    const id = currentRabbitHoleId;
    r2LoadedForHoleRef.current = null;

    void (async () => {
      try {
        const res = await fetch(
          `/api/graph?rabbitHoleId=${encodeURIComponent(id)}`
        );
        if (!res.ok) return;

        const data = (await res.json()) as {
          graph: GraphSnapshot | null;
          r2Available: boolean;
        };

        // Bail out if the user switched to a different hole before we got the response.
        if (useRabbitHoleStore.getState().currentRabbitHoleId !== id) return;

        if (data.graph) {
          applySnapshotToStore(data.graph);
          r2LoadedForHoleRef.current = id;
          console.log(`[R2] ✓ loaded graph for hole ${id.slice(0, 8)} — ${data.graph.nodes.length} nodes`);
        } else if (data.r2Available) {
          console.log(`[R2] No stored graph for hole ${id.slice(0, 8)}`);
        }
      } catch (err) {
        console.warn(`[R2] Failed to load graph for hole ${id.slice(0, 8)}:`, err);
      }
    })();
  }, [currentRabbitHoleId]);

  // Initialize connection once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (connRef.current || connectingRef.current || connectingConnRef.current) return;

    let stopped = false;
    let retryAttempt = 0;
    let clearedInvalidToken = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = (reason: string, afterMs?: string): boolean => {
      if (stopped || retryAttempt >= STDB_MAX_CONNECT_RETRIES) return false;
      const delay = Math.min(STDB_RETRY_BASE_DELAY_MS * 2 ** retryAttempt, 10_000);
      retryAttempt += 1;
      const after = afterMs ? ` after ${afterMs}ms` : "";
      console.warn(
        `[STDB] ${reason}${after}. Reconnecting in ${delay}ms ` +
          `(attempt ${retryAttempt + 1}/${STDB_MAX_CONNECT_RETRIES + 1})...`
      );
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, delay);
      return true;
    };

    const connect = () => {
      if (stopped || connRef.current || connectingRef.current || connectingConnRef.current) return;
      connectingRef.current = true;

      const connectStart = performance.now();
      const attempt = retryAttempt + 1;
      const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? undefined;
      console.log(`[STDB] Connecting to ${MODULE_NAME} at ${SPACETIMEDB_URI} (attempt ${attempt})`);

      let conn: DbConnection;
      try {
        conn = DbConnection.builder()
          .withUri(SPACETIMEDB_URI)
          .withDatabaseName(MODULE_NAME)
          .withToken(token)
          .onConnect((_conn, _identity, newToken) => {
            connectingRef.current = false;
            connectingConnRef.current = null;
            retryAttempt = 0;
            const connectMs = (performance.now() - connectStart).toFixed(1);
            console.log(`[STDB] ✓ Connected in ${connectMs}ms`);

            connRef.current = conn;
            localStorage.setItem(AUTH_TOKEN_KEY, newToken);
            setDbConnected(true);
            setDbConnection(conn);
            void flushPendingGraphWrites();

            // Register rabbit_hole table callbacks for the global subscription
            conn.db.rabbit_hole.onInsert((_ctx, row) => {
              const t0 = performance.now();
              const hole: RabbitHole = {
                id: row.id,
                name: row.name,
                rootQuery: row.rootQuery ?? undefined,
                visibility: "private",
                createdAt: Number(row.createdAt),
                updatedAt: Number(row.updatedAt),
              };
              upsertRabbitHole(hole);
              console.log(`[STDB] rabbit_hole.insert "${row.name}" +${(performance.now() - t0).toFixed(1)}ms`);
            });
            conn.db.rabbit_hole.onDelete((_ctx, row) => {
              removeRabbitHole(row.id);
              console.log(`[STDB] rabbit_hole.delete id=${row.id}`);
            });
            conn.db.rabbit_hole.onUpdate((_ctx, _old, row) => {
              upsertRabbitHole({
                id: row.id,
                name: row.name,
                rootQuery: row.rootQuery ?? undefined,
                visibility: "private",
                createdAt: Number(row.createdAt),
                updatedAt: Number(row.updatedAt),
              });
              console.log(`[STDB] rabbit_hole.update "${row.name}"`);
            });

            // Long-lived subscription: all rabbit holes (sorted client-side)
            const rhSubStart = performance.now();
            console.log("[STDB] Subscribing to rabbit_hole list...");
            const builder = conn.subscriptionBuilder();
            rabbitHoleSubRef.current = builder
              .onApplied(() => {
                const subMs = (performance.now() - rhSubStart).toFixed(1);
                // Hydrate rabbit holes list from local cache
                const holes: RabbitHole[] = [];
                for (const row of conn.db.rabbit_hole.iter()) {
                  holes.push({
                    id: row.id,
                    name: row.name,
                    rootQuery: row.rootQuery ?? undefined,
                    visibility: "private",
                    createdAt: Number(row.createdAt),
                    updatedAt: Number(row.updatedAt),
                  });
                }
                holes.sort((a, b) => b.createdAt - a.createdAt);
                useRabbitHoleStore.getState().setRabbitHoles(holes);
                console.log(`[STDB] ✓ rabbit_hole list applied in ${subMs}ms — ${holes.length} holes`);

                // Set the most recent rabbit hole as current if none selected
                if (!useRabbitHoleStore.getState().currentRabbitHoleId && holes.length > 0) {
                  setCurrentRabbitHoleId(holes[0].id);
                }
              })
              .subscribe("SELECT * FROM rabbit_hole");
          })
          .onDisconnect((_ctx, err) => {
            connectingRef.current = false;
            connectingConnRef.current = null;
            connRef.current = null;
            setDbConnected(false);
            setDbConnection(null);
            safeUnsubscribe(rabbitHoleSubRef.current, "rabbit_hole list");
            safeUnsubscribe(holeSubRef.current, "current hole");
            rabbitHoleSubRef.current = null;
            holeSubRef.current = null;

            const parsed = err != null ? parseConnectError(err) : null;
            const disconnectedMsg = parsed?.message ?? "Disconnected";
            if (!scheduleReconnect(disconnectedMsg)) {
              console.warn(`[STDB] ${disconnectedMsg}`);
            }
          })
          .onConnectError((_ctx, err) => {
            connectingRef.current = false;
            connectingConnRef.current = null;
            connRef.current = null;
            setDbConnected(false);
            setDbConnection(null);

            const connectMs = (performance.now() - connectStart).toFixed(1);
            const parsed = parseConnectError(err);

            if (parsed.tokenInvalid && !clearedInvalidToken) {
              localStorage.removeItem(AUTH_TOKEN_KEY);
              clearedInvalidToken = true;
            }

            const retried =
              (parsed.shouldRetry && scheduleReconnect(parsed.message, connectMs)) ||
              (parsed.tokenInvalid && scheduleReconnect(parsed.message, connectMs));

            if (retried) return;

            console.error(
              `[STDB] ✗ Connection error after ${connectMs}ms: ${parsed.message}. ` +
                "App works without DB (local-only graph)."
            );
          })
          .build();
        connectingConnRef.current = conn;
      } catch (err) {
        connectingRef.current = false;
        connectingConnRef.current = null;
        connRef.current = null;
        setDbConnected(false);
        setDbConnection(null);
        const parsed = parseConnectError(err);
        if (parsed.shouldRetry && scheduleReconnect(parsed.message)) return;
        console.error(
          `[STDB] ✗ Failed to initialize SpacetimeDB connection: ${parsed.message}. ` +
            "App works without DB (local-only graph)."
        );
      }
    };

    connect();

    return () => {
      stopped = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      safeUnsubscribe(rabbitHoleSubRef.current, "rabbit_hole list");
      safeUnsubscribe(holeSubRef.current, "current hole");
      rabbitHoleSubRef.current = null;
      holeSubRef.current = null;
      connectingRef.current = false;
      connectingConnRef.current?.disconnect();
      connectingConnRef.current = null;
      connRef.current?.disconnect();
      connRef.current = null;
      setDbConnected(false);
      setDbConnection(null);
    };
  }, [setDbConnected, setDbConnection, upsertRabbitHole, removeRabbitHole, setCurrentRabbitHoleId]);

  // When currentRabbitHoleId changes, swap subscriptions
  useEffect(() => {
    const conn = dbConnection;
    if (!conn) return;
    if (!currentRabbitHoleId) return;
    void flushPendingGraphWrites();

    const id = currentRabbitHoleId;
    const holeSubStart = performance.now();
    console.log(`[STDB] Switching to hole ${id}...`);

    // Subscribe to new hole BEFORE unsubscribing from old (subscribe-before-unsubscribe)
    const oldHandle = holeSubRef.current;

    // Clear graph store while loading
    graphStore.getState().clearGraph();

    // Register per-hole table callbacks
    const onNodeInsert = (_ctx: unknown, row: Parameters<typeof rowToNode>[0]) => {
      if (row.rabbitHoleId !== id) return;
      const t0 = performance.now();
      const node = rowToNode(row);
      graphStore.getState().addNodes([node]);
      console.log(`[STDB] node.insert "${row.id.slice(0, 8)}" +${(performance.now() - t0).toFixed(1)}ms`);
    };
    const onNodeDelete = (_ctx: unknown, row: { id: string; rabbitHoleId: string }) => {
      if (row.rabbitHoleId !== id) return;
      const localNodeId = fromDbNodeId(id, row.id);
      graphStore.getState().removeNodes([localNodeId]);
      console.log(`[STDB] node.delete id=${localNodeId.slice(0, 8)}`);
    };
    const onNodeUpdate = (_ctx: unknown, _old: unknown, row: Parameters<typeof rowToNode>[0]) => {
      if (row.rabbitHoleId !== id) return;
      const t0 = performance.now();
      const node = rowToNode(row);
      const nodes = new Map(graphStore.getState().nodes);
      nodes.set(node.id, node);
      graphStore.setState({ nodes });
      console.log(`[STDB] node.update "${row.id.slice(0, 8)}" +${(performance.now() - t0).toFixed(1)}ms`);
    };

    const onEdgeInsert = (_ctx: unknown, row: Parameters<typeof rowToEdge>[0]) => {
      if (row.rabbitHoleId !== id) return;
      graphStore.getState().addEdges([rowToEdge(row)]);
      console.log(`[STDB] edge.insert ${row.source.slice(0, 6)}→${row.target.slice(0, 6)}`);
    };
    const onEdgeDelete = (_ctx: unknown, row: { id: string; rabbitHoleId: string }) => {
      if (row.rabbitHoleId !== id) return;
      graphStore.getState().removeEdges([row.id]);
      console.log(`[STDB] edge.delete id=${row.id.slice(0, 8)}`);
    };

    const onClusterInsert = (_ctx: unknown, row: Parameters<typeof rowToCluster>[0]) => {
      if (row.rabbitHoleId !== id) return;
      const existing = graphStore.getState().clusters;
      const updated = [...existing.filter((c) => c.id !== row.id), rowToCluster(row)];
      graphStore.getState().setClusters(updated);
      console.log(`[STDB] cluster.insert "${row.label}"`);
    };
    const onClusterDelete = (_ctx: unknown, row: { id: string; rabbitHoleId: string }) => {
      if (row.rabbitHoleId !== id) return;
      const existing = graphStore.getState().clusters;
      graphStore.getState().setClusters(existing.filter((c) => c.id !== row.id));
      console.log(`[STDB] cluster.delete id=${row.id.slice(0, 8)}`);
    };

    const onContentInsert = (_ctx: unknown, row: {
      nodeId: string; rabbitHoleId: string; url: string; content: string; truncated: boolean;
    }) => {
      if (row.rabbitHoleId !== id) return;
      const t0 = performance.now();
      const localNodeId = fromDbNodeId(id, row.nodeId);
      const node = graphStore.getState().nodes.get(localNodeId);
      if (node) {
        const updatedNode = {
          ...node,
          data: { ...node.data, fetchedContent: row.content, contentTruncated: row.truncated },
        };
        const nodes = new Map(graphStore.getState().nodes);
        nodes.set(localNodeId, updatedNode);
        graphStore.setState({ nodes });
        console.log(`[STDB] node_content.insert nodeId=${localNodeId.slice(0, 8)} len=${row.content.length} truncated=${row.truncated} +${(performance.now() - t0).toFixed(1)}ms`);
      }
    };

    const onChatThreadInsert = (
      _ctx: unknown,
      row: Parameters<typeof rowToChatThread>[0]
    ) => {
      if (row.rabbitHoleId !== id) return;
      chatStore.getState().upsertThread(rowToChatThread(row));
      console.log(`[STDB] chat_thread.insert id=${row.id.slice(0, 8)}`);
    };
    const onChatThreadUpdate = (
      _ctx: unknown,
      _old: unknown,
      row: Parameters<typeof rowToChatThread>[0]
    ) => {
      if (row.rabbitHoleId !== id) return;
      chatStore.getState().upsertThread(rowToChatThread(row));
      console.log(`[STDB] chat_thread.update id=${row.id.slice(0, 8)}`);
    };
    const onChatThreadDelete = (
      _ctx: unknown,
      row: { id: string; rabbitHoleId: string }
    ) => {
      if (row.rabbitHoleId !== id) return;
      chatStore.getState().removeThread(id, row.id);
      console.log(`[STDB] chat_thread.delete id=${row.id.slice(0, 8)}`);
    };

    const onChatMessageInsert = (
      _ctx: unknown,
      row: Parameters<typeof rowToChatMessage>[0]
    ) => {
      if (row.rabbitHoleId !== id) return;
      chatStore.getState().upsertMessage(rowToChatMessage(row));
    };
    const onChatMessageUpdate = (
      _ctx: unknown,
      _old: unknown,
      row: Parameters<typeof rowToChatMessage>[0]
    ) => {
      if (row.rabbitHoleId !== id) return;
      chatStore.getState().upsertMessage(rowToChatMessage(row));
    };
    const onChatMessageDelete = (
      _ctx: unknown,
      row: { id: string; rabbitHoleId: string; threadId: string }
    ) => {
      if (row.rabbitHoleId !== id) return;
      chatStore.getState().removeMessage(id, row.threadId, row.id);
    };

    conn.db.node.onInsert(onNodeInsert as never);
    conn.db.node.onDelete(onNodeDelete as never);
    conn.db.node.onUpdate(onNodeUpdate as never);
    conn.db.edge.onInsert(onEdgeInsert as never);
    conn.db.edge.onDelete(onEdgeDelete as never);
    conn.db.cluster.onInsert(onClusterInsert as never);
    conn.db.cluster.onDelete(onClusterDelete as never);
    conn.db.node_content.onInsert(onContentInsert as never);
    conn.db.chat_thread.onInsert(onChatThreadInsert as never);
    conn.db.chat_thread.onUpdate(onChatThreadUpdate as never);
    conn.db.chat_thread.onDelete(onChatThreadDelete as never);
    conn.db.chat_message.onInsert(onChatMessageInsert as never);
    conn.db.chat_message.onUpdate(onChatMessageUpdate as never);
    conn.db.chat_message.onDelete(onChatMessageDelete as never);

    const newHandle = conn
      .subscriptionBuilder()
      .onApplied(() => {
        const hydrationStart = performance.now();
        const subRttMs = (performance.now() - holeSubStart).toFixed(1);
        console.log(`[STDB] ✓ hole:${id.slice(0, 8)} subscription applied in ${subRttMs}ms — hydrating...`);

        const nodesArr: PaperNode[] = [];
        const edgesArr: GraphEdge[] = [];
        const clustersArr: Cluster[] = [];
        const threadsArr: ChatThread[] = [];
        const messagesArr: ChatMessageRecord[] = [];
        const contentMap = new Map<string, { content: string; truncated: boolean }>();

        for (const row of conn.db.node_content.iter()) {
          if (row.rabbitHoleId === id) {
            const localNodeId = fromDbNodeId(id, row.nodeId);
            contentMap.set(localNodeId, { content: row.content, truncated: row.truncated });
          }
        }
        for (const row of conn.db.node.iter()) {
          if (row.rabbitHoleId === id) {
            const node = rowToNode(row);
            const c = contentMap.get(node.id);
            if (c) {
              node.data = { ...node.data, fetchedContent: c.content, contentTruncated: c.truncated };
            }
            nodesArr.push(node);
          }
        }
        for (const row of conn.db.edge.iter()) {
          if (row.rabbitHoleId === id) edgesArr.push(rowToEdge(row));
        }
        for (const row of conn.db.cluster.iter()) {
          if (row.rabbitHoleId === id) clustersArr.push(rowToCluster(row));
        }
        for (const row of conn.db.chat_thread.iter()) {
          if (row.rabbitHoleId === id) threadsArr.push(rowToChatThread(row));
        }
        for (const row of conn.db.chat_message.iter()) {
          if (row.rabbitHoleId === id) messagesArr.push(rowToChatMessage(row));
        }

        // Only hydrate graph from STDB if R2 has not already loaded this hole.
        // R2 is the source of truth for graph data when configured.
        if (r2LoadedForHoleRef.current !== id) {
          graphStore.getState().clearGraph();
          if (nodesArr.length > 0) graphStore.getState().addNodes(nodesArr);
          if (edgesArr.length > 0) graphStore.getState().addEdges(edgesArr);
          if (clustersArr.length > 0) graphStore.getState().setClusters(clustersArr);
        } else {
          console.log(`[STDB] hole:${id.slice(0, 8)} graph already loaded from R2; skipping STDB graph hydration`);
        }

        const currentActive = chatStore.getState().byHole[id]?.activeThreadId ?? null;
        chatStore.getState().hydrateHole({
          rabbitHoleId: id,
          threads: threadsArr,
          messages: messagesArr,
          preferredActiveThreadId: currentActive,
        });

        const hydrationMs = (performance.now() - hydrationStart).toFixed(1);
        const totalMs = (performance.now() - holeSubStart).toFixed(1);
        console.log(
          `[STDB] ✓ hole:${id.slice(0, 8)} hydrated in ${hydrationMs}ms (total ${totalMs}ms) — ` +
          `${nodesArr.length} nodes, ${edgesArr.length} edges, ${clustersArr.length} clusters, ${contentMap.size} content, ` +
          `${threadsArr.length} chat threads, ${messagesArr.length} chat messages`
        );
      })
      .subscribe([
        `SELECT * FROM node WHERE rabbit_hole_id = '${id}'`,
        `SELECT * FROM edge WHERE rabbit_hole_id = '${id}'`,
        `SELECT * FROM cluster WHERE rabbit_hole_id = '${id}'`,
        `SELECT * FROM node_content WHERE rabbit_hole_id = '${id}'`,
        `SELECT * FROM chat_thread WHERE rabbit_hole_id = '${id}'`,
        `SELECT * FROM chat_message WHERE rabbit_hole_id = '${id}'`,
      ]);

    holeSubRef.current = newHandle;

    // Now unsubscribe from old handle (subscribe-before-unsubscribe)
    safeUnsubscribe(oldHandle, "previous hole");

    return () => {
      conn.db.node.removeOnInsert(onNodeInsert as never);
      conn.db.node.removeOnDelete(onNodeDelete as never);
      conn.db.node.removeOnUpdate(onNodeUpdate as never);
      conn.db.edge.removeOnInsert(onEdgeInsert as never);
      conn.db.edge.removeOnDelete(onEdgeDelete as never);
      conn.db.cluster.removeOnInsert(onClusterInsert as never);
      conn.db.cluster.removeOnDelete(onClusterDelete as never);
      conn.db.node_content.removeOnInsert(onContentInsert as never);
      conn.db.chat_thread.removeOnInsert(onChatThreadInsert as never);
      conn.db.chat_thread.removeOnUpdate(onChatThreadUpdate as never);
      conn.db.chat_thread.removeOnDelete(onChatThreadDelete as never);
      conn.db.chat_message.removeOnInsert(onChatMessageInsert as never);
      conn.db.chat_message.removeOnUpdate(onChatMessageUpdate as never);
      conn.db.chat_message.removeOnDelete(onChatMessageDelete as never);
    };
  }, [currentRabbitHoleId, dbConnection, graphStore, chatStore]);

  return <>{children}</>;
}
