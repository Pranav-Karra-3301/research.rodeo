"use client";

import { useEffect, useRef } from "react";
import { DbConnection, type SubscriptionHandle } from "@/lib/spacetimedb";
import { useRabbitHoleStore, type RabbitHole } from "@/store/rabbit-hole-store";
import { useGraphStore } from "@/store/graph-store";
import { useChatStore } from "@/store/chat-store";
import { parsePersistedNotes } from "@/lib/db/graph-actions";
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
const AUTH_TOKEN_KEY = "rh_stdb_token";

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
  let data = { id: row.id, title: "", authors: [], citationCount: 0, referenceCount: 0, externalIds: {} };
  let scores: NodeScores = { relevance: 0, influence: 0, recency: 0, semanticSimilarity: 0, localCentrality: 0, velocity: 0 };
  try { data = JSON.parse(row.dataJson); } catch {}
  try { scores = JSON.parse(row.scoresJson); } catch {}

  const dataNotes =
    typeof (data as Record<string, unknown>)["_userNotes"] === "string"
      ? ((data as Record<string, unknown>)["_userNotes"] as string)
      : undefined;
  const parsedNotes = parsePersistedNotes(row.userNotes ?? dataNotes);

  return {
    id: row.id,
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
    source: row.source,
    target: row.target,
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
  const holeSubRef = useRef<SubscriptionHandle | null>(null);
  const rabbitHoleSubRef = useRef<SubscriptionHandle | null>(null);

  const setDbConnected = useRabbitHoleStore((s) => s.setDbConnected);
  const setDbConnection = useRabbitHoleStore((s) => s.setDbConnection);
  const upsertRabbitHole = useRabbitHoleStore((s) => s.upsertRabbitHole);
  const removeRabbitHole = useRabbitHoleStore((s) => s.removeRabbitHole);
  const setCurrentRabbitHoleId = useRabbitHoleStore((s) => s.setCurrentRabbitHoleId);
  const currentRabbitHoleId = useRabbitHoleStore((s) => s.currentRabbitHoleId);

  const graphStore = useGraphStore;
  const chatStore = useChatStore;

  // Initialize connection once
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (connRef.current) return;

    const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? undefined;
    const connectStart = performance.now();
    console.log("[STDB] Connecting to", MODULE_NAME, "at", SPACETIMEDB_URI);

    const conn = DbConnection.builder()
      .withUri(SPACETIMEDB_URI)
      .withDatabaseName(MODULE_NAME)
      .withToken(token)
      .onConnect((_conn, _identity, newToken) => {
        const connectMs = (performance.now() - connectStart).toFixed(1);
        console.log(`[STDB] ✓ Connected in ${connectMs}ms`);

        connRef.current = conn;
        localStorage.setItem(AUTH_TOKEN_KEY, newToken);
        setDbConnected(true);
        setDbConnection(conn);

        // Register rabbit_hole table callbacks for the global subscription
        conn.db.rabbit_hole.onInsert((_ctx, row) => {
          const t0 = performance.now();
          const hole: RabbitHole = {
            id: row.id,
            name: row.name,
            rootQuery: row.rootQuery ?? undefined,
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
      .onDisconnect(() => {
        console.warn("[STDB] Disconnected");
        connRef.current = null;
        setDbConnected(false);
        setDbConnection(null);
      })
      .onConnectError((_ctx, err) => {
        const connectMs = (performance.now() - connectStart).toFixed(1);
        console.error(`[STDB] ✗ Connection error after ${connectMs}ms:`, err);
      })
      .build();

    // Register node/edge/cluster/content callbacks (will fire when per-hole subscription is active)
    // These are registered once but only fire for subscribed rows

    return () => {
      rabbitHoleSubRef.current?.unsubscribe();
      holeSubRef.current?.unsubscribe();
    };
  }, [setDbConnected, setDbConnection, upsertRabbitHole, removeRabbitHole, setCurrentRabbitHoleId]);

  // When currentRabbitHoleId changes, swap subscriptions
  useEffect(() => {
    const conn = connRef.current;
    if (!conn) return;
    if (!currentRabbitHoleId) return;

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
      graphStore.getState().removeNodes([row.id]);
      console.log(`[STDB] node.delete id=${row.id.slice(0, 8)}`);
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
      const node = graphStore.getState().nodes.get(row.nodeId);
      if (node) {
        const updatedNode = {
          ...node,
          data: { ...node.data, fetchedContent: row.content, contentTruncated: row.truncated },
        };
        const nodes = new Map(graphStore.getState().nodes);
        nodes.set(row.nodeId, updatedNode);
        graphStore.setState({ nodes });
        console.log(`[STDB] node_content.insert nodeId=${row.nodeId.slice(0, 8)} len=${row.content.length} truncated=${row.truncated} +${(performance.now() - t0).toFixed(1)}ms`);
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
      .onApplied((_ctx) => {
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
            contentMap.set(row.nodeId, { content: row.content, truncated: row.truncated });
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

        graphStore.getState().clearGraph();
        if (nodesArr.length > 0) graphStore.getState().addNodes(nodesArr);
        if (edgesArr.length > 0) graphStore.getState().addEdges(edgesArr);
        if (clustersArr.length > 0) graphStore.getState().setClusters(clustersArr);
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
    oldHandle?.unsubscribe();

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
  }, [currentRabbitHoleId, graphStore, chatStore]);

  return <>{children}</>;
}
