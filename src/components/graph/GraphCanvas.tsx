"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import { ContentNode } from "./nodes/ContentNode";
import { FrontierNode } from "./nodes/FrontierNode";
import { InsightNode } from "./nodes/InsightNode";
import { DeadEndNode } from "./nodes/DeadEndNode";
import { KeyFindNode } from "./nodes/KeyFindNode";
import { QuestionNode } from "./nodes/QuestionNode";
import { SummaryNode } from "./nodes/SummaryNode";
import { CitationEdge } from "./edges/CitationEdge";
import { SemanticEdge } from "./edges/SemanticEdge";
import { ContradictionEdge } from "./edges/ContradictionEdge";
import { AnnotationEdge } from "./edges/AnnotationEdge";
import { GraphContextMenu } from "./GraphContextMenu";
import { useGraph } from "@/hooks/useGraph";
import { useGraphStore } from "@/store/graph-store";
import { useUIStore } from "@/store/ui-store";
import { useHistoryStore } from "@/store/history-store";
import { useEgoNavigation } from "@/hooks/useEgoNavigation";
import { useSemanticZoom } from "@/hooks/useSemanticZoom";
import { executeGraphCommand } from "@/lib/graph/commands";
import type { ExpansionMode, GraphNodeData } from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const nodeTypes = {
  content: ContentNode,
  frontier: FrontierNode,
  insight: InsightNode,
  "dead-end": DeadEndNode,
  "key-find": KeyFindNode,
  question: QuestionNode,
  summary: SummaryNode,
} as any;

const edgeTypes = {
  citation: CitationEdge,
  semantic: SemanticEdge,
  contradiction: ContradictionEdge,
  annotation: AnnotationEdge,
} as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface ContextMenuState {
  type: "node" | "canvas";
  position: { x: number; y: number };
  nodeId?: string;
  nodeTitle?: string;
}

function FitViewOnMaterialize() {
  const lastMaterializedNodeId = useGraphStore((s) => s.lastMaterializedNodeId);
  const clearLastMaterializedNodeId = useGraphStore((s) => s.clearLastMaterializedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (!lastMaterializedNodeId) return;
    const timer = requestAnimationFrame(() => {
      fitView({
        nodes: [{ id: lastMaterializedNodeId }],
        padding: 0.3,
        maxZoom: 1.25,
        duration: 300,
      });
      selectNode(lastMaterializedNodeId);
      clearLastMaterializedNodeId();
    });
    return () => cancelAnimationFrame(timer);
  }, [lastMaterializedNodeId, fitView, selectNode, clearLastMaterializedNodeId]);

  return null;
}

export function GraphCanvas() {
  const { rfNodes, rfEdges, onNodesChange: hookNC, onEdgesChange: hookEC } = useGraph();
  const selectNode = useGraphStore((s) => s.selectNode);
  const toggleNodeSelection = useGraphStore((s) => s.toggleNodeSelection);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const toggleSearch = useUIStore((s) => s.toggleSearch);
  const { navigateToNode } = useEgoNavigation();
  const { zoomLevel } = useSemanticZoom();
  const { fitView: rfFitView } = useReactFlow();

  const [nodes, setNodes, onNC] = useNodesState(rfNodes);
  const [edges, setEdges, onEC] = useEdgesState(rfEdges);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);
  const [minimap, setMinimap] = useState(true);

  useEffect(() => { setNodes(rfNodes); }, [rfNodes, setNodes]);
  useEffect(() => { setEdges(rfEdges); }, [rfEdges, setEdges]);

  const handleNC = useCallback(
    (c: Parameters<typeof onNC>[0]) => { onNC(c); hookNC(c); },
    [onNC, hookNC]
  );
  const handleEC = useCallback(
    (c: Parameters<typeof onEC>[0]) => { onEC(c); hookEC(c); },
    [onEC, hookEC]
  );

  const handleNodeClick: NodeMouseHandler = useCallback((e, node) => {
    if (e.shiftKey) {
      toggleNodeSelection(node.id);
      setCtxMenu(null);
      return;
    }
    // Ego-centric navigation on click
    if (!node.id.startsWith("annotation-")) {
      navigateToNode(node.id);
    }
    selectNode(node.id);
    setCtxMenu(null);
  }, [selectNode, toggleNodeSelection, navigateToNode]);

  const handleNodeCtx: NodeMouseHandler = useCallback((e, node) => {
    e.preventDefault();
    const data = node.data as unknown as GraphNodeData;
    setCtxMenu({
      type: "node",
      position: { x: e.clientX, y: e.clientY },
      nodeId: node.id,
      nodeTitle: data.paper?.title ?? "",
    });
  }, []);

  const handlePaneCtx = useCallback((e: MouseEvent | React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ type: "canvas", position: { x: e.clientX, y: e.clientY } });
  }, []);

  const handlePaneClick = useCallback(() => {
    setCtxMenu(null);
    clearSelection();
  }, [clearSelection]);

  const handleNodeDragStop: NodeMouseHandler = useCallback((_e, node) => {
    const posMap = new Map([[node.id, { x: node.position.x, y: node.position.y }]]);
    useGraphStore.getState().updateNodePositions(posMap);
  }, []);

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  const handleExpandNode = useCallback((nodeId: string, mode: ExpansionMode) => {
    void executeGraphCommand({ type: "expand-node", nodeId, mode, source: "canvas" });
  }, []);

  const handleArchiveNode = useCallback((nodeId: string) => {
    void executeGraphCommand({ type: "archive-node", nodeId, source: "canvas" });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const { selectedNodeIds, selectedNodeId } = useGraphStore.getState();
    const nodeIds = selectedNodeIds.size > 0
      ? Array.from(selectedNodeIds)
      : selectedNodeId ? [selectedNodeId] : [];
    if (nodeIds.length === 0) return;

    const graph = useGraphStore.getState();
    const removeSet = new Set(nodeIds);
    const removedNodes = nodeIds
      .map((id) => graph.nodes.get(id))
      .filter((n): n is NonNullable<typeof n> => n != null)
      .map((n) => ({ ...n }));
    const removedEdges = graph.edges
      .filter((e) => removeSet.has(e.source) || removeSet.has(e.target))
      .map((e) => ({ ...e }));

    useGraphStore.getState().removeNodes(nodeIds);
    useGraphStore.getState().removeEdges(removedEdges.map((e) => e.id));
    useGraphStore.getState().recalculateScores();
    useGraphStore.getState().recalculateClusters();
    clearSelection();

    useHistoryStore.getState().push({
      description: `Deleted ${nodeIds.length} node(s)`,
      undo: () => {
        useGraphStore.getState().addNodes(removedNodes);
        useGraphStore.getState().addEdges(removedEdges);
        useGraphStore.getState().recalculateScores();
        useGraphStore.getState().recalculateClusters();
      },
      redo: () => {
        useGraphStore.getState().removeNodes(nodeIds);
        useGraphStore.getState().removeEdges(removedEdges.map((e) => e.id));
        useGraphStore.getState().recalculateScores();
        useGraphStore.getState().recalculateClusters();
      },
    });
  }, [clearSelection]);

  const handleRelayout = useCallback(async () => {
    await executeGraphCommand({ type: "relayout", source: "canvas" });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleSearch();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        useHistoryStore.getState().undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        useHistoryStore.getState().redo();
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if ((e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
          handleDeleteSelected();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSearch, handleDeleteSelected]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNC}
        onEdgesChange={handleEC}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={handleNodeClick}
        onNodeContextMenu={handleNodeCtx}
        onNodeDragStop={handleNodeDragStop}
        onPaneContextMenu={handlePaneCtx}
        onPaneClick={handlePaneClick}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1.25 }}
        minZoom={0.1}
        maxZoom={2.5}
        nodesDraggable
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        className="bg-[#f8f7f4]"
      >
        <FitViewOnMaterialize />
        <Controls position="bottom-left" />
        {minimap && (
          <MiniMap
            className="!bg-[#f8f7f4] !border-[#e8e7e2]"
            maskColor="rgba(255, 255, 255, 0.7)"
            nodeColor={(n) => {
              const d = n.data as unknown as GraphNodeData;
              return d?.isFrontier ? "#c8c7c2" : "#8b5cf6";
            }}
            position="bottom-right"
            pannable
            zoomable
          />
        )}
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#b3b0a6" />
      </ReactFlow>

      {/* Zoom level indicator */}
      <div className="absolute top-3 right-3 px-2 py-1 text-[10px] text-[#78716c] bg-white/80 rounded border border-[#e8e7e2]">
        {zoomLevel}
      </div>

      {ctxMenu?.type === "node" && ctxMenu.nodeId && (
        <GraphContextMenu
          type="node"
          position={ctxMenu.position}
          nodeId={ctxMenu.nodeId}
          nodeTitle={ctxMenu.nodeTitle ?? ""}
          onExpand={(mode) => handleExpandNode(ctxMenu.nodeId!, mode)}
          onArchive={() => handleArchiveNode(ctxMenu.nodeId!)}
          onDelete={() => { handleDeleteSelected(); closeMenu(); }}
          onClose={closeMenu}
        />
      )}
      {ctxMenu?.type === "canvas" && (
        <GraphContextMenu
          type="canvas"
          position={ctxMenu.position}
          onFitView={() => {
            rfFitView({ padding: 0.25, maxZoom: 1.25 });
          }}
          onToggleMinimap={() => setMinimap(!minimap)}
          onAutoLayout={() => { void handleRelayout(); }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
