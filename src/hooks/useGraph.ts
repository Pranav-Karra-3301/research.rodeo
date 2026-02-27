"use client";

import { useMemo, useCallback } from "react";
import { useGraphStore } from "@/store/graph-store";
import { EDGE_STYLES, CLUSTER_COLORS } from "@/lib/design-tokens";
import { executeGraphCommand } from "@/lib/graph/commands";
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react";
import type { ExpansionMode, GraphNodeData, EdgeType } from "@/types";

/** Map citation count to node width (188px min, 286px max) */
function citationWidth(citationCount: number): number {
  if (citationCount <= 0) return 188;
  const t = Math.min(Math.log10(citationCount + 1) / 4, 1);
  return Math.round(188 + t * 98);
}

/** Map edge type to our custom React Flow edge type */
function mapEdgeType(type: EdgeType): string {
  if (type === "contradicts") return "contradiction";
  if (type === "semantic-similarity" || type === "methodologically-similar") return "semantic";
  return "citation";
}

/** Deterministic cluster color from cluster ID */
function resolveClusterColor(clusterId: string | undefined, clusters: { id: string; color?: string }[]): string | undefined {
  if (!clusterId) return undefined;
  const cluster = clusters.find((c) => c.id === clusterId);
  if (cluster?.color) return cluster.color;
  let hash = 0;
  for (let i = 0; i < clusterId.length; i++) {
    hash = (hash * 31 + clusterId.charCodeAt(i)) | 0;
  }
  return CLUSTER_COLORS[Math.abs(hash) % CLUSTER_COLORS.length];
}

export function useGraph() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const clusters = useGraphStore((s) => s.clusters);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const expandingNodeIds = useGraphStore((s) => s.expandingNodeIds);

  const materializeNode = useCallback((nodeId: string) => {
    const node = useGraphStore.getState().nodes.get(nodeId);
    if (!node) return;
    void executeGraphCommand({
      type: "add-node",
      paper: node.data,
      materialize: true,
      source: "canvas",
    });
  }, []);

  const expandNode = useCallback((nodeId: string, mode: ExpansionMode) => {
    void executeGraphCommand({
      type: "expand-node",
      nodeId,
      mode,
      source: "canvas",
    });
  }, []);

  const rfNodes: Node[] = useMemo(() => {
    const nodeArray = nodes instanceof Map ? Array.from(nodes.values()) : nodes;
    return nodeArray
      .filter((n) => n.state !== "archived")
      .map((node) => {
        const isFrontier = node.state === "discovered";
        const clusterColor = resolveClusterColor(node.clusterId, clusters);
        const nodeId = node.id;

        const isMultiSelected = selectedNodeIds.has(nodeId);
        const isExpanding = expandingNodeIds.has(nodeId);

        return {
          id: nodeId,
          type: isFrontier ? "frontier" : "paper",
          position: node.position,
          selected: node.id === selectedNodeId || isMultiSelected,
          width: isFrontier ? 176 : citationWidth(node.data.citationCount),
          data: {
            paper: node.data,
            state: node.state,
            scores: node.scores,
            clusterId: node.clusterId,
            isSelected: node.id === selectedNodeId,
            isMultiSelected,
            isExpanding,
            isFrontier,
            onSelect: () => useGraphStore.getState().selectNode(nodeId),
            onExpand: (mode) => expandNode(nodeId, mode),
            onMaterialize: isFrontier
              ? () => materializeNode(nodeId)
              : undefined,
          } satisfies GraphNodeData,
          style: {
            borderColor: clusterColor,
          },
        };
      });
  }, [nodes, clusters, selectedNodeId, selectedNodeIds, expandingNodeIds, materializeNode, expandNode]);

  const rfEdges: Edge[] = useMemo(() => {
    return edges.map((edge) => {
      const edgeStyle = EDGE_STYLES[edge.type as keyof typeof EDGE_STYLES];
      const type = mapEdgeType(edge.type);

      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type,
        animated: edge.trust === "inferred",
        data: {
          type: edge.type,
          trust: edge.trust,
          weight: edge.weight,
        },
        style: edgeStyle
          ? {
              stroke: edgeStyle.stroke,
              strokeWidth: edgeStyle.strokeWidth,
              strokeDasharray: edgeStyle.dashArray,
              opacity: edge.trust === "inferred" ? 0.4 : 0.7,
            }
          : undefined,
      };
    });
  }, [edges]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const positionUpdates = new Map<string, { x: number; y: number }>();

    for (const change of changes) {
      if (change.type === "position" && change.position) {
        positionUpdates.set(change.id, change.position);
      }
      if (change.type === "select" && change.selected) {
        useGraphStore.getState().selectNode(change.id);
      }
    }

    if (positionUpdates.size > 0) {
      useGraphStore.getState().updateNodePositions(positionUpdates);
    }
  }, []);

  const onEdgesChange = useCallback((_changes: EdgeChange[]) => {
    // Edge changes managed through the store
    void _changes;
  }, []);

  return { rfNodes, rfEdges, onNodesChange, onEdgesChange };
}
