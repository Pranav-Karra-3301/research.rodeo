/**
 * graph-actions.ts
 *
 * Thin wrappers around graph-store mutations that also call SpacetimeDB reducers
 * for persistence.  Components should import from here instead of calling
 * graph-store mutations directly when they want persistent changes.
 *
 * The Zustand store is updated immediately for instant feedback;
 * SpacetimeDB is called in the background for persistence.
 */

import { useGraphStore } from "@/store/graph-store";
import {
  useRabbitHoleStore,
  newRabbitHoleId,
  type RabbitHole,
} from "@/store/rabbit-hole-store";
import { useTimelineStore } from "@/store/timeline-store";
import { toDbNodeId } from "@/lib/db/node-id";
import type { PaperNode, GraphEdge, Cluster, NodeState } from "@/types";

function getConn() {
  return useRabbitHoleStore.getState().dbConnection;
}

function getHoleId() {
  return useRabbitHoleStore.getState().currentRabbitHoleId;
}

function logStdb(msg: string): void {
  if (process.env.NODE_ENV === "development") {
    console.log(msg);
  }
}

type ReducerName =
  | "createRabbitHole"
  | "addNode"
  | "removeNode"
  | "addEdge"
  | "removeEdge"
  | "updateNodeState"
  | "updateNodePosition"
  | "updateNodeData"
  | "setClusters"
  | "clearRabbitHole";

type QueuedReducerCall = {
  name: ReducerName;
  args: unknown;
  queuedAt: number;
};

const pendingReducerCalls: QueuedReducerCall[] = [];
let isFlushingReducerQueue = false;

function shouldDropQueuedCall(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "SenderError" ||
    error.message.includes("is unavailable on this connection")
  );
}

function enqueueReducerCall(name: ReducerName, args: unknown): void {
  pendingReducerCalls.push({ name, args, queuedAt: Date.now() });
}

async function invokeReducer(
  name: ReducerName,
  args: unknown
): Promise<void> {
  const conn = getConn();
  if (!conn) throw new Error("No SpacetimeDB connection");
  const reducers = conn.reducers as Record<
    string,
    ((params: unknown) => Promise<void>) | undefined
  >;
  const fn = reducers[name];
  if (!fn) {
    throw new Error(`Reducer "${name}" is unavailable on this connection`);
  }
  await fn(args);
}

function dispatchReducer(name: ReducerName, args: unknown): void {
  const conn = getConn();
  if (!conn || pendingReducerCalls.length > 0 || isFlushingReducerQueue) {
    enqueueReducerCall(name, args);
    void flushPendingGraphWrites();
    return;
  }

  void invokeReducer(name, args).catch((error) => {
    if (shouldDropQueuedCall(error)) {
      console.warn(
        `[STDB] reducer:${name} failed with non-retryable error; dropping write`,
        error
      );
      return;
    }
    enqueueReducerCall(name, args);
    console.warn(`[STDB] reducer:${name} queued after dispatch failure`, error);
    void flushPendingGraphWrites();
  });
}

/** Flushes queued graph writes in-order once DB connection is available. */
export async function flushPendingGraphWrites(): Promise<void> {
  const conn = getConn();
  if (!conn) return;
  if (isFlushingReducerQueue) return;
  if (pendingReducerCalls.length === 0) return;

  isFlushingReducerQueue = true;
  try {
    while (pendingReducerCalls.length > 0) {
      const next = pendingReducerCalls[0];
      try {
        await invokeReducer(next.name, next.args);
        pendingReducerCalls.shift();
      } catch (error) {
        if (shouldDropQueuedCall(error)) {
          console.warn(
            `[STDB] queued reducer:${next.name} failed with non-retryable error; dropping write`,
            error
          );
          pendingReducerCalls.shift();
          continue;
        }
        console.warn(
          `[STDB] queued reducer:${next.name} failed; keeping ${
            pendingReducerCalls.length
          } queued writes`,
          error
        );
        break;
      }
    }
  } finally {
    isFlushingReducerQueue = false;
  }
}

function ensureHoleForNodeWrites(): string {
  const state = useRabbitHoleStore.getState();
  if (state.currentRabbitHoleId) return state.currentRabbitHoleId;

  const id = newRabbitHoleId();
  const now = Date.now();
  const hole: RabbitHole = {
    id,
    name: "Untitled Rabbit Hole",
    rootQuery: undefined,
    visibility: "private",
    createdAt: now,
    updatedAt: now,
  };
  state.upsertRabbitHole(hole);
  state.setCurrentRabbitHoleId(id);

  // Queue creation first so subsequent node writes are ordered after hole creation.
  enqueueReducerCall("createRabbitHole", {
    id,
    name: hole.name,
    rootQuery: hole.rootQuery,
  });
  void flushPendingGraphWrites();

  logStdb(`[STDB] created local rabbit hole ${id} for graph writes`);
  return id;
}

/** Persist and add nodes to the current rabbit hole. */
export function persistAddNodes(nodes: PaperNode[]): void {
  useGraphStore.getState().addNodes(nodes);

  const holeId = ensureHoleForNodeWrites();

  const t0 = performance.now();
  for (const node of nodes) {
    const dbNodeId = toDbNodeId(holeId, node.id);
    dispatchReducer("addNode", {
      rabbitHoleId: holeId,
      nodeId: dbNodeId,
      dataJson: JSON.stringify(node.data),
      state: node.state,
      positionX: node.position.x,
      positionY: node.position.y,
      scoresJson: JSON.stringify(node.scores),
      addedAt: BigInt(node.addedAt),
    });
  }
  logStdb(`[STDB] reducer:addNode ×${nodes.length} dispatched in ${(performance.now() - t0).toFixed(1)}ms`);

  // Track timeline events
  for (const node of nodes) {
    useTimelineStore.getState().addEvent({
      type: "add-node",
      summary: `Added "${node.data.title}"`,
      nodeId: node.id,
    });
  }
}

/** Persist and remove nodes from the current rabbit hole. */
export function persistRemoveNodes(nodeIds: string[]): void {
  useGraphStore.getState().removeNodes(nodeIds);

  const holeId = getHoleId();
  if (!holeId) return;

  const t0 = performance.now();
  for (const nodeId of nodeIds) {
    dispatchReducer("removeNode", {
      rabbitHoleId: holeId,
      nodeId: toDbNodeId(holeId, nodeId),
    });
  }
  logStdb(`[STDB] reducer:removeNode ×${nodeIds.length} dispatched in ${(performance.now() - t0).toFixed(1)}ms`);

  // Track timeline events
  for (const nodeId of nodeIds) {
    useTimelineStore.getState().addEvent({
      type: "archive",
      summary: `Removed node ${nodeId.slice(0, 8)}`,
      nodeId,
    });
  }
}

/** Persist and add edges. */
export function persistAddEdges(edges: GraphEdge[]): void {
  useGraphStore.getState().addEdges(edges);

  const holeId = ensureHoleForNodeWrites();

  const t0 = performance.now();
  for (const edge of edges) {
    dispatchReducer("addEdge", {
      rabbitHoleId: holeId,
      edgeId: edge.id,
      source: toDbNodeId(holeId, edge.source),
      target: toDbNodeId(holeId, edge.target),
      edgeType: edge.type,
      trust: edge.trust,
      weight: edge.weight,
      evidence: edge.evidence ?? undefined,
      metadataJson: edge.metadata ? JSON.stringify(edge.metadata) : undefined,
    });
  }
  logStdb(`[STDB] reducer:addEdge ×${edges.length} dispatched in ${(performance.now() - t0).toFixed(1)}ms`);
}

/** Persist and remove edges. */
export function persistRemoveEdges(edgeIds: string[]): void {
  useGraphStore.getState().removeEdges(edgeIds);

  const holeId = getHoleId();
  if (!holeId) return;

  for (const edgeId of edgeIds) {
    dispatchReducer("removeEdge", { rabbitHoleId: holeId, edgeId });
  }
}

/** Persist a node state change. */
export function persistUpdateNodeState(nodeId: string, state: NodeState): void {
  useGraphStore.getState().updateNodeState(nodeId, state);

  const holeId = getHoleId();
  if (!holeId) return;

  dispatchReducer("updateNodeState", {
    rabbitHoleId: holeId,
    nodeId: toDbNodeId(holeId, nodeId),
    state,
  });
}

/** Persist node position updates. */
export function persistUpdateNodePositions(positions: Map<string, { x: number; y: number }>): void {
  useGraphStore.getState().updateNodePositions(positions);

  const holeId = getHoleId();
  if (!holeId) return;

  const t0 = performance.now();
  for (const [nodeId, pos] of positions) {
    dispatchReducer("updateNodePosition", {
      rabbitHoleId: holeId,
      nodeId: toDbNodeId(holeId, nodeId),
      positionX: pos.x,
      positionY: pos.y,
    });
  }
  logStdb(`[STDB] reducer:updateNodePosition ×${positions.size} dispatched in ${(performance.now() - t0).toFixed(1)}ms`);
}

/** Persist node notes and tags change. */
export function persistUpdateNodeNotes(nodeId: string, userNotes: string, userTags: string[]): void {
  // Update the Zustand store immediately
  const nodes = new Map(useGraphStore.getState().nodes);
  const node = nodes.get(nodeId);
  if (!node) return;
  // Encode tags as a JSON prefix in the notes string so it round-trips through dataJson
  const tagsPrefix = userTags.length > 0 ? `[tags:${JSON.stringify(userTags)}]\n` : "";
  const combined = tagsPrefix + userNotes;

  // Store notes on node and encode into data for dataJson serialization
  const updatedData = { ...node.data, _userNotes: combined || undefined };
  nodes.set(nodeId, { ...node, data: updatedData, userNotes: userNotes || undefined, userTags: userTags.length > 0 ? userTags : undefined });
  useGraphStore.setState({ nodes });

  const holeId = getHoleId();
  if (!holeId) return;

  const updatedNode = nodes.get(nodeId);
  if (!updatedNode) return;

  const conn = getConn();

  // Prefer dedicated notes column persistence when available.
  try {
    if (conn) {
      (
        conn.reducers as unknown as {
          updateNodeNotes?: (args: {
            rabbitHoleId: string;
            nodeId: string;
            userNotes?: string;
          }) => Promise<void>;
        }
      ).updateNodeNotes?.({
        rabbitHoleId: holeId,
        nodeId: toDbNodeId(holeId, nodeId),
        userNotes: combined || undefined,
      });
    }
  } catch (error) {
    // Keep note edits durable even if the connected module lacks this reducer.
    console.warn(`[STDB] reducer:updateNodeNotes unavailable for ${nodeId}`, error);
  }

  // Keep backward compatibility: persist _userNotes inside data_json as fallback.
  dispatchReducer("updateNodeData", {
    rabbitHoleId: holeId,
    nodeId: toDbNodeId(holeId, nodeId),
    dataJson: JSON.stringify(updatedNode.data),
    scoresJson: JSON.stringify(updatedNode.scores),
  });
  logStdb(`[STDB] reducer:updateNodeNotes/updateNodeData (notes) for ${nodeId}`);
}

/** Parse persisted notes string back into { notes, tags }. */
export function parsePersistedNotes(raw?: string): { notes: string; tags: string[] } {
  if (!raw) return { notes: "", tags: [] };
  const tagMatch = raw.match(/^\[tags:(\[.*?\])\]\n/);
  if (tagMatch) {
    try {
      const tags = JSON.parse(tagMatch[1]) as string[];
      const notes = raw.slice(tagMatch[0].length);
      return { notes, tags };
    } catch {
      return { notes: raw, tags: [] };
    }
  }
  return { notes: raw, tags: [] };
}

/** Persist node data change (after scoring recalc). */
export function persistUpdateNodeData(nodeId: string): void {
  const node = useGraphStore.getState().nodes.get(nodeId);
  if (!node) return;

  const holeId = getHoleId();
  if (!holeId) return;

  dispatchReducer("updateNodeData", {
    rabbitHoleId: holeId,
    nodeId: toDbNodeId(holeId, nodeId),
    dataJson: JSON.stringify(node.data),
    scoresJson: JSON.stringify(node.scores),
  });
}

/** Persist clusters update. */
export function persistSetClusters(clusters: Cluster[]): void {
  useGraphStore.getState().setClusters(clusters);

  const holeId = getHoleId();
  if (!holeId) return;

  const clustersPayload = clusters.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    nodeIds: c.nodeIds.map((nodeId) => toDbNodeId(holeId, nodeId)),
    color: c.color,
    centroid: c.centroid,
  }));

  dispatchReducer("setClusters", {
    rabbitHoleId: holeId,
    clustersJson: JSON.stringify(clustersPayload),
  });
}

/** Persist clear graph for the current rabbit hole. */
export function persistClearGraph(): void {
  useGraphStore.getState().clearGraph();

  const holeId = getHoleId();
  if (!holeId) return;

  dispatchReducer("clearRabbitHole", { rabbitHoleId: holeId });
}

/**
 * Persist the full in-memory graph to SpacetimeDB for the current rabbit hole.
 * Clears the hole on the server then re-sends all nodes, edges, and clusters.
 * Use when the graph was modified without going through persist* (e.g. Add Source)
 * or to force a full sync.
 */
export async function saveGraphToSpacetimeDB(): Promise<void> {
  const holeId = ensureHoleForNodeWrites();
  const state = useGraphStore.getState();
  const nodesArr = Array.from(state.nodes.values());
  const edgesArr = state.edges;
  const clustersArr = state.clusters;

  if (nodesArr.length === 0 && edgesArr.length === 0 && clustersArr.length === 0) {
    logStdb("[STDB] saveGraphToSpacetimeDB: graph empty, skipping");
    return;
  }

  logStdb(`[STDB] saveGraphToSpacetimeDB: clearing hole then re-adding ${nodesArr.length} nodes, ${edgesArr.length} edges, ${clustersArr.length} clusters`);
  dispatchReducer("clearRabbitHole", { rabbitHoleId: holeId });
  await flushPendingGraphWrites();

  if (nodesArr.length > 0) persistAddNodes(nodesArr);
  if (edgesArr.length > 0) persistAddEdges(edgesArr);
  persistSetClusters(clustersArr);
  await flushPendingGraphWrites();
  logStdb("[STDB] saveGraphToSpacetimeDB: done");
}
