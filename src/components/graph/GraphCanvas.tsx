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
import {
  persistAddNodes,
  persistAddEdges,
  persistRemoveNodes,
  persistRemoveEdges,
  persistSetClusters,
  persistUpdateNodePositions,
  persistClearGraph,
} from "@/lib/db/graph-actions";
import { executeGraphCommand } from "@/lib/graph/commands";
import { useKeyboard } from "@/hooks/useKeyboard";
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

/** When a node is materialized, pan to it (preserving zoom) and select it so the user sees the new paper node. */
function FitViewOnMaterialize() {
  const lastMaterializedNodeId = useGraphStore((s) => s.lastMaterializedNodeId);
  const clearLastMaterializedNodeId = useGraphStore((s) => s.clearLastMaterializedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const { setCenter, getZoom, getNode } = useReactFlow();

  useEffect(() => {
    if (!lastMaterializedNodeId) return;
    const timer = requestAnimationFrame(() => {
      const node = getNode(lastMaterializedNodeId);
      if (node) {
        const x = node.position.x + (node.measured?.width ?? 200) / 2;
        const y = node.position.y + (node.measured?.height ?? 100) / 2;
        setCenter(x, y, { zoom: getZoom(), duration: 300 });
      }
      selectNode(lastMaterializedNodeId);
      clearLastMaterializedNodeId();
    });
    return () => cancelAnimationFrame(timer);
  }, [lastMaterializedNodeId, setCenter, getZoom, getNode, selectNode, clearLastMaterializedNodeId]);

  return null;
}

export function GraphCanvas() {
  const { rfNodes, rfEdges, onNodesChange: hookNC, onEdgesChange: hookEC } = useGraph();
  const selectNode = useGraphStore((s) => s.selectNode);
  const toggleNodeSelection = useGraphStore((s) => s.toggleNodeSelection);
  const selectAllNodes = useGraphStore((s) => s.selectAllNodes);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const setRightPanel = useUIStore((s) => s.setRightPanel);
  const toggleSearch = useUIStore((s) => s.toggleSearch);
  const openAddSource = useUIStore((s) => s.openAddSource);
  const { navigateToNode } = useEgoNavigation();
  const reactFlow = useReactFlow();

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
    // Shift+click: toggle multi-select
    if (e.shiftKey) {
      toggleNodeSelection(node.id);
      setCtxMenu(null);
      return;
    }
    // Smooth pan to clicked materialized node (no zoom change, no repositioning)
    if (!node.id.startsWith("annotation-")) {
      const graphNode = useGraphStore.getState().nodes.get(node.id);
      if (graphNode && graphNode.state === "materialized") {
        const rfNode = reactFlow.getNode(node.id);
        if (rfNode) {
          const x = rfNode.position.x + (rfNode.measured?.width ?? 200) / 2;
          const y = rfNode.position.y + (rfNode.measured?.height ?? 100) / 2;
          reactFlow.setCenter(x, y, { zoom: reactFlow.getZoom(), duration: 400 });
        }
      }
    }
    selectNode(node.id);
    setRightPanel("reader");
    setCtxMenu(null);
  }, [selectNode, toggleNodeSelection, reactFlow, setRightPanel]);

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
    persistUpdateNodePositions(posMap);
  }, []);

  const closeMenu = useCallback(() => setCtxMenu(null), []);

  const handleExpandNode = useCallback((nodeId: string, mode: ExpansionMode) => {
    void executeGraphCommand({ type: "expand-node", nodeId, mode, source: "canvas" });
  }, []);

  const handleArchiveNode = useCallback((nodeId: string) => {
    void executeGraphCommand({ type: "archive-node", nodeId, source: "canvas" });
  }, []);

  const handleDeleteWithHistory = useCallback((nodeIds: string[]) => {
    if (nodeIds.length === 0) return;

    const recalculateAndPersist = () => {
      const store = useGraphStore.getState();
      store.recalculateScores();
      store.recalculateClusters();
      persistSetClusters(useGraphStore.getState().clusters);
    };

    // Snapshot nodes and their edges for undo
    const graph = useGraphStore.getState();
    const removedNodes = nodeIds
      .map((id) => graph.nodes.get(id))
      .filter((n): n is NonNullable<typeof n> => n != null)
      .map((n) => ({ ...n }));
    const removeSet = new Set(nodeIds);
    const removedEdges = graph.edges
      .filter((e) => removeSet.has(e.source) || removeSet.has(e.target))
      .map((e) => ({ ...e }));

    const removedEdgeIds = removedEdges.map((edge) => edge.id);
    if (removedEdgeIds.length > 0) {
      persistRemoveEdges(removedEdgeIds);
    }
    persistRemoveNodes(nodeIds);
    recalculateAndPersist();

    useHistoryStore.getState().push({
      description: `Deleted ${nodeIds.length} node(s)`,
      undo: () => {
        if (removedNodes.length > 0) {
          persistAddNodes(removedNodes);
        }
        if (removedEdges.length > 0) {
          persistAddEdges(removedEdges);
        }
        recalculateAndPersist();
      },
      redo: () => {
        if (removedEdgeIds.length > 0) {
          persistRemoveEdges(removedEdgeIds);
        }
        persistRemoveNodes(nodeIds);
        recalculateAndPersist();
      },
    });
  }, []);

  const handleDeleteSelected = useCallback(() => {
    const { selectedNodeIds, selectedNodeId } = useGraphStore.getState();
    if (selectedNodeIds.size > 0) {
      handleDeleteWithHistory(Array.from(selectedNodeIds));
      clearSelection();
    } else if (selectedNodeId) {
      handleDeleteWithHistory([selectedNodeId]);
    }
  }, [handleDeleteWithHistory, clearSelection]);

  const handleRelayout = useCallback(async () => {
    await executeGraphCommand({ type: "relayout", source: "canvas" });
  }, []);

  // Wire up keyboard shortcuts
  useKeyboard({
    onToggleSearch: toggleSearch,
    onToggleChat: useCallback(() => {
      // Chat is now embedded in the canvas via UnifiedChatInput
    }, []),
    onToggleExport: useCallback(() => {
      useUIStore.getState().toggleRightPanel("export");
    }, []),
    onClosePanel: useCallback(() => {
      useUIStore.getState().setRightPanel(null);
      clearSelection();
    }, [clearSelection]),
    onUndo: useCallback(() => useHistoryStore.getState().undo(), []),
    onRedo: useCallback(() => useHistoryStore.getState().redo(), []),
    onSelectAll: selectAllNodes,
    onDeleteSelected: handleDeleteSelected,
  });

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

      {ctxMenu?.type === "node" && ctxMenu.nodeId && (
        <GraphContextMenu
          type="node"
          position={ctxMenu.position}
          nodeId={ctxMenu.nodeId}
          nodeTitle={ctxMenu.nodeTitle ?? ""}
          onFocusView={() => navigateToNode(ctxMenu.nodeId!)}
          onExpand={(mode) => handleExpandNode(ctxMenu.nodeId!, mode)}
          onArchive={() => handleArchiveNode(ctxMenu.nodeId!)}
          onDelete={() => { handleDeleteWithHistory([ctxMenu.nodeId!]); closeMenu(); }}
          onClose={closeMenu}
        />
      )}
      {ctxMenu?.type === "canvas" && (
        <PaneMenu
          position={ctxMenu.position}
          onToggleMinimap={() => setMinimap(!minimap)}
          onRelayout={handleRelayout}
          onAddSource={openAddSource}
          onClearGraph={persistClearGraph}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}

function PaneMenu({
  position,
  onToggleMinimap,
  onRelayout,
  onAddSource,
  onClearGraph,
  onClose,
}: {
  position: { x: number; y: number };
  onToggleMinimap: () => void;
  onRelayout: () => Promise<void>;
  onAddSource: () => void;
  onClearGraph: () => void;
  onClose: () => void;
}) {
  const { fitView } = useReactFlow();
  return (
    <GraphContextMenu
      type="canvas"
      position={position}
      onFitView={() => fitView({ padding: 0.25, maxZoom: 1.25 })}
      onToggleMinimap={onToggleMinimap}
      onAutoLayout={() => {
        void onRelayout().then(() => fitView({ padding: 0.25, maxZoom: 1.25 }));
      }}
      onAddSource={onAddSource}
      onClearGraph={onClearGraph}
      onClose={onClose}
    />
  );
}
