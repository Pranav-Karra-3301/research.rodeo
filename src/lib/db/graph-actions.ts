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
import { useRabbitHoleStore } from "@/store/rabbit-hole-store";
import { useTimelineStore } from "@/store/timeline-store";
import type { PaperNode, GraphEdge, Cluster, NodeState } from "@/types";

function getConn() {
  return useRabbitHoleStore.getState().dbConnection;
}

function getHoleId() {
  return useRabbitHoleStore.getState().currentRabbitHoleId;
}

/** Persist and add nodes to the current rabbit hole. */
export function persistAddNodes(nodes: PaperNode[]): void {
  useGraphStore.getState().addNodes(nodes);

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  const t0 = performance.now();
  for (const node of nodes) {
    conn.reducers.addNode({
      rabbitHoleId: holeId,
      nodeId: node.id,
      dataJson: JSON.stringify(node.data),
      state: node.state,
      positionX: node.position.x,
      positionY: node.position.y,
      scoresJson: JSON.stringify(node.scores),
      addedAt: BigInt(node.addedAt),
    });
  }
  console.log(`[STDB] reducer:addNode ×${nodes.length} dispatched in ${(performance.now() - t0).toFixed(1)}ms`);

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

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  const t0 = performance.now();
  for (const nodeId of nodeIds) {
    conn.reducers.removeNode({ rabbitHoleId: holeId, nodeId });
  }
  console.log(`[STDB] reducer:removeNode ×${nodeIds.length} dispatched in ${(performance.now() - t0).toFixed(1)}ms`);

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

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  const t0 = performance.now();
  for (const edge of edges) {
    conn.reducers.addEdge({
      rabbitHoleId: holeId,
      edgeId: edge.id,
      source: edge.source,
      target: edge.target,
      edgeType: edge.type,
      trust: edge.trust,
      weight: edge.weight,
      evidence: edge.evidence ?? undefined,
      metadataJson: edge.metadata ? JSON.stringify(edge.metadata) : undefined,
    });
  }
  console.log(`[STDB] reducer:addEdge ×${edges.length} dispatched in ${(performance.now() - t0).toFixed(1)}ms`);
}

/** Persist and remove edges. */
export function persistRemoveEdges(edgeIds: string[]): void {
  useGraphStore.getState().removeEdges(edgeIds);

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  for (const edgeId of edgeIds) {
    conn.reducers.removeEdge({ rabbitHoleId: holeId, edgeId });
  }
}

/** Persist a node state change. */
export function persistUpdateNodeState(nodeId: string, state: NodeState): void {
  useGraphStore.getState().updateNodeState(nodeId, state);

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  conn.reducers.updateNodeState({ rabbitHoleId: holeId, nodeId, state });
}

/** Persist node position updates. */
export function persistUpdateNodePositions(positions: Map<string, { x: number; y: number }>): void {
  useGraphStore.getState().updateNodePositions(positions);

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  const t0 = performance.now();
  for (const [nodeId, pos] of positions) {
    conn.reducers.updateNodePosition({
      rabbitHoleId: holeId,
      nodeId,
      positionX: pos.x,
      positionY: pos.y,
    });
  }
  console.log(`[STDB] reducer:updateNodePosition ×${positions.size} dispatched in ${(performance.now() - t0).toFixed(1)}ms`);
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

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  const updatedNode = nodes.get(nodeId);
  if (!updatedNode) return;

  // Prefer dedicated notes column persistence when available.
  try {
    (
      conn.reducers as unknown as {
        updateNodeNotes?: (args: {
          rabbitHoleId: string;
          nodeId: string;
          userNotes?: string;
        }) => void;
      }
    ).updateNodeNotes?.({
      rabbitHoleId: holeId,
      nodeId,
      userNotes: combined || undefined,
    });
  } catch (error) {
    // Keep note edits durable even if the connected module lacks this reducer.
    console.warn(`[STDB] reducer:updateNodeNotes unavailable for ${nodeId}`, error);
  }

  // Keep backward compatibility: persist _userNotes inside data_json as fallback.
  conn.reducers.updateNodeData({
    rabbitHoleId: holeId,
    nodeId,
    dataJson: JSON.stringify(updatedNode.data),
    scoresJson: JSON.stringify(updatedNode.scores),
  });
  console.log(`[STDB] reducer:updateNodeNotes/updateNodeData (notes) for ${nodeId}`);
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

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  conn.reducers.updateNodeData({
    rabbitHoleId: holeId,
    nodeId,
    dataJson: JSON.stringify(node.data),
    scoresJson: JSON.stringify(node.scores),
  });
}

/** Persist clusters update. */
export function persistSetClusters(clusters: Cluster[]): void {
  useGraphStore.getState().setClusters(clusters);

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  const clustersPayload = clusters.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    nodeIds: c.nodeIds,
    color: c.color,
    centroid: c.centroid,
  }));

  conn.reducers.setClusters({
    rabbitHoleId: holeId,
    clustersJson: JSON.stringify(clustersPayload),
  });
}

/** Persist clear graph for the current rabbit hole. */
export function persistClearGraph(): void {
  useGraphStore.getState().clearGraph();

  const conn = getConn();
  const holeId = getHoleId();
  if (!conn || !holeId) return;

  conn.reducers.clearRabbitHole({ rabbitHoleId: holeId });
}
