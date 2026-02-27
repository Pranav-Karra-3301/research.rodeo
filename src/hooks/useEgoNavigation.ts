"use client";

import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useGraphStore } from "@/store/graph-store";
import { useNavigationStore } from "@/store/navigation-store";
import { computeEgoLayout } from "@/lib/graph/ego-layout";
import { computeHopDistances } from "@/lib/visual/fade-calculator";

export function useEgoNavigation() {
  const reactFlow = useReactFlow();

  const navigateToNode = useCallback((nodeId: string) => {
    const { nodes, edges } = useGraphStore.getState();
    if (!nodes.has(nodeId)) return;

    useNavigationStore.getState().setTransitioning(true);
    useNavigationStore.getState().setFocus(nodeId);

    // Compute ego layout
    const positions = computeEgoLayout(nodeId, nodes, edges);

    // Update hop distances for fade
    const nodeIds = new Set(nodes.keys());
    const hopDistances = computeHopDistances(nodeId, edges, nodeIds);
    useNavigationStore.getState().setHopDistances(hopDistances);

    // Animate positions
    useGraphStore.getState().updateNodePositions(positions);
    useGraphStore.getState().setFocusNode(nodeId);

    // Center viewport
    reactFlow.setCenter(0, 0, { zoom: 1.0, duration: 400 });

    setTimeout(() => {
      useNavigationStore.getState().setTransitioning(false);
    }, 500);
  }, [reactFlow]);

  const goBack = useCallback(() => {
    const { previousFocusNodeId } = useNavigationStore.getState();
    if (previousFocusNodeId) {
      navigateToNode(previousFocusNodeId);
    }
  }, [navigateToNode]);

  const isTransitioning = useNavigationStore((s) => s.transitionInProgress);

  return { navigateToNode, goBack, isTransitioning };
}
