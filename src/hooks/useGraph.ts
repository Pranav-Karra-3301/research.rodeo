"use client";

import { useMemo, useCallback } from "react";
import { useGraphStore } from "@/store/graph-store";
import { useNavigationStore } from "@/store/navigation-store";
import { EDGE_STYLES, CLUSTER_COLORS, ANNOTATION_COLORS } from "@/lib/design-tokens";
import { getRecencyColor } from "@/lib/visual/recency-color";
import { getNodeDimensions } from "@/lib/visual/importance-size";
import { getNodeOpacity } from "@/lib/visual/fade-calculator";
import { executeGraphCommand } from "@/lib/graph/commands";
import type { Node, Edge, NodeChange, EdgeChange } from "@xyflow/react";
import type { ExpansionMode, GraphNodeData, EdgeType } from "@/types";

function mapEdgeType(type: EdgeType): string {
  if (type === "contradicts") return "contradiction";
  if (type === "semantic-similarity" || type === "methodologically-similar") return "semantic";
  return "citation";
}

function resolveClusterColor(
  clusterId: string | undefined,
  clusters: { id: string; color?: string }[]
): string | undefined {
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
  const annotationNodes = useGraphStore((s) => s.annotationNodes);
  const focusNodeId = useGraphStore((s) => s.focusNodeId);

  const hopDistances = useNavigationStore((s) => s.hopDistances);
  const maxVisibleHops = useNavigationStore((s) => s.maxVisibleHops);

  const expandNode = useCallback((nodeId: string, mode: ExpansionMode) => {
    void executeGraphCommand({
      type: "expand-node",
      nodeId,
      mode,
      source: "canvas",
    });
  }, []);

  const rfNodes: Node[] = useMemo(() => {
    const contentNodes: Node[] = [];
    const nodeArray = nodes instanceof Map ? Array.from(nodes.values()) : nodes;

    for (const node of nodeArray) {
      if (node.state === "archived") continue;

      const isFrontier = node.state === "discovered";
      const clusterColor = resolveClusterColor(node.clusterId, clusters);
      const recencyColor = getRecencyColor(node.scores.recency);
      const dimensions = getNodeDimensions(node.data.citationCount, node.scores.relevance);
      const isMultiSelected = selectedNodeIds.has(node.id);
      const isExpanding = expandingNodeIds.has(node.id);

      // Compute fade opacity when ego nav is active
      const fadeOpacity = focusNodeId
        ? getNodeOpacity(hopDistances.get(node.id), maxVisibleHops)
        : 1;

      contentNodes.push({
        id: node.id,
        type: isFrontier ? "frontier" : "content",
        position: node.position,
        selected: node.id === selectedNodeId || isMultiSelected,
        data: {
          paper: node.data,
          state: node.state,
          scores: node.scores,
          clusterId: node.clusterId,
          isSelected: node.id === selectedNodeId,
          isMultiSelected,
          isExpanding,
          isFrontier,
          recencyColor,
          dimensions,
          fadeOpacity,
          onSelect: () => useGraphStore.getState().selectNode(node.id),
          onExpand: (mode: ExpansionMode) => expandNode(node.id, mode),
          onMaterialize: isFrontier
            ? () => useGraphStore.getState().materializeNode(node.id)
            : undefined,
        } satisfies GraphNodeData,
        style: {
          borderColor: clusterColor,
          opacity: fadeOpacity,
          transition: "opacity 0.3s ease",
        },
      });
    }

    // Add annotation nodes
    for (const [, annotation] of annotationNodes) {
      contentNodes.push({
        id: annotation.id,
        type: annotation.type,
        position: annotation.position,
        data: {
          annotation,
          onEdit: (content: string) =>
            useGraphStore.getState().updateAnnotation(annotation.id, content),
          onDelete: () =>
            useGraphStore.getState().removeAnnotation(annotation.id),
        },
      });
    }

    return contentNodes;
  }, [
    nodes, clusters, selectedNodeId, selectedNodeIds, expandingNodeIds,
    annotationNodes, focusNodeId, hopDistances, maxVisibleHops, expandNode,
  ]);

  const rfEdges: Edge[] = useMemo(() => {
    const result: Edge[] = [];

    // Graph edges
    for (const edge of edges) {
      const edgeStyle = EDGE_STYLES[edge.type as keyof typeof EDGE_STYLES];
      result.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: mapEdgeType(edge.type),
        animated: edge.trust === "inferred",
        data: { type: edge.type, trust: edge.trust, weight: edge.weight },
        style: edgeStyle
          ? {
              stroke: edgeStyle.stroke,
              strokeWidth: edgeStyle.strokeWidth,
              strokeDasharray: edgeStyle.dashArray,
              opacity: edge.trust === "inferred" ? 0.4 : 0.7,
            }
          : undefined,
      });
    }

    // Annotation edges
    for (const [, annotation] of annotationNodes) {
      if (annotation.attachedToNodeId) {
        result.push({
          id: `annotation-edge-${annotation.id}`,
          source: annotation.id,
          target: annotation.attachedToNodeId,
          type: "annotation",
          style: {
            stroke: ANNOTATION_COLORS[annotation.type]?.border ?? "#94a3b8",
            strokeWidth: 1,
            strokeDasharray: "4 4",
            opacity: 0.4,
          },
        });
      }
    }

    return result;
  }, [edges, annotationNodes]);

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
    void _changes;
  }, []);

  return { rfNodes, rfEdges, onNodesChange, onEdgesChange };
}
