import { nanoid } from "nanoid";
import type {
  EdgeTrust,
  GraphCommandIntent,
  GraphCommandResult,
  GraphEdge,
  NodeScores,
  PaperMetadata,
  PaperNode,
} from "@/types";
import { computeLayout, incrementalLayout } from "@/lib/graph/layout";
import { useGraphStore } from "@/store/graph-store";
import { useHistoryStore } from "@/store/history-store";

const ZERO_SCORES: NodeScores = {
  relevance: 0,
  influence: 0,
  recency: 0,
  semanticSimilarity: 0,
  localCentrality: 0,
  velocity: 0,
};

function now() {
  return Date.now();
}

function recalculateAll() {
  const store = useGraphStore.getState();
  store.recalculateScores();
  store.recalculateClusters();
}

function positionForNewNodes(nodes: PaperNode[]): PaperNode[] {
  if (nodes.length === 0) return nodes;
  const graph = useGraphStore.getState();
  const existingNodes = graph.nodes;
  const edges = graph.edges;
  const newIds = new Set(nodes.map((n) => n.id));

  const existingPos = new Map<string, { x: number; y: number }>();
  for (const n of existingNodes.values()) {
    existingPos.set(n.id, n.position);
  }

  const allNodes = new Map(existingNodes);
  for (const node of nodes) {
    allNodes.set(node.id, node);
  }

  const positions = existingNodes.size
    ? incrementalLayout(
        existingPos,
        nodes,
        allNodes,
        edges,
        graph.clusters,
        { width: 1200, height: 800 }
      )
    : computeLayout(nodes, [], undefined, { width: 1200, height: 800 });

  return nodes.map((node) =>
    newIds.has(node.id)
      ? { ...node, position: positions.get(node.id) ?? node.position }
      : node
  );
}

function makePaperNode(
  paper: PaperMetadata,
  state: "discovered" | "materialized" = "discovered"
): PaperNode {
  return {
    id: paper.id,
    data: paper,
    state,
    position: { x: 0, y: 0 },
    scores: { ...ZERO_SCORES },
    addedAt: now(),
  };
}

function graphEdge(
  sourceId: string,
  targetId: string,
  type: GraphEdge["type"],
  trust: EdgeTrust = "inferred",
  weight = 0.5,
  evidence?: string
): GraphEdge {
  return {
    id: `edge-${nanoid(10)}`,
    source: sourceId,
    target: targetId,
    type,
    trust,
    weight,
    evidence,
  };
}

export async function executeGraphCommand(intent: GraphCommandIntent): Promise<GraphCommandResult> {
  try {
    switch (intent.type) {
      case "add-node": {
        const graph = useGraphStore.getState();
        const existing = graph.nodes.get(intent.paper.id);

        if (existing) {
          if (intent.materialize && existing.state !== "materialized") {
            useGraphStore.getState().materializeNode(existing.id);
          }
          const summary = `Source already in graph: ${intent.paper.title}`;
          return { applied: true, summary, addedNodeIds: [existing.id] };
        }

        const state = intent.materialize ? "materialized" : "discovered";
        const node = makePaperNode(intent.paper, state);
        const [positioned] = positionForNewNodes([node]);

        useGraphStore.getState().addNodes([positioned]);
        recalculateAll();

        const summary = `Added source: ${intent.paper.title}`;
        const addedNodeId = positioned.id;
        const addedPaper = intent.paper;
        const addedState = state;

        useHistoryStore.getState().push({
          description: summary,
          undo: () => {
            useGraphStore.getState().removeNodes([addedNodeId]);
            recalculateAll();
          },
          redo: () => {
            const redoNode = makePaperNode(addedPaper, addedState);
            useGraphStore.getState().addNodes([{ ...redoNode, position: positioned.position }]);
            recalculateAll();
          },
        });

        return { applied: true, summary, addedNodeIds: [positioned.id] };
      }

      case "connect-nodes": {
        const edge = graphEdge(
          intent.sourceId,
          intent.targetId,
          intent.edgeType,
          intent.trust ?? "inferred",
          intent.weight ?? 0.5,
          intent.evidence
        );
        useGraphStore.getState().addEdges([edge]);
        recalculateAll();
        const summary = `Connected ${intent.sourceId.slice(0, 8)} -> ${intent.targetId.slice(0, 8)}`;
        return { applied: true, summary, addedEdgeIds: [edge.id] };
      }

      case "expand-node": {
        const graphState = useGraphStore.getState();
        const sourceNode = graphState.nodes.get(intent.nodeId);
        useGraphStore.getState().setExpanding(intent.nodeId);

        const res = await fetch("/api/expand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodeId: intent.nodeId,
            mode: intent.mode,
            budget: intent.budget ?? 12,
            sourceUrl: sourceNode?.data.url,
            sourceTitle: sourceNode?.data.title,
            sourceExternalIds: sourceNode?.data.externalIds,
          }),
        });

        if (!res.ok) {
          useGraphStore.getState().clearExpanding(intent.nodeId);
          const err = await res.text().catch(() => `Expand failed (${res.status})`);
          return { applied: false, summary: "Expand failed", error: err };
        }

        const json = (await res.json()) as {
          status: "success" | "error";
          error?: string;
          data?: {
            papers: PaperMetadata[];
            edges: GraphEdge[];
            sourceNodeId: string;
          };
        };

        if (json.status !== "success" || !json.data) {
          useGraphStore.getState().clearExpanding(intent.nodeId);
          return { applied: false, summary: "Expand failed", error: json.error ?? "No expansion data" };
        }

        useGraphStore.getState().clearExpanding(intent.nodeId);
        const graph = useGraphStore.getState();
        const existingIds = new Set(graph.nodes.keys());
        const newNodes = json.data.papers
          .filter((paper) => !existingIds.has(paper.id))
          .map((paper) => makePaperNode(paper, "discovered"));
        const newEdges = json.data.edges.filter(
          (edge) =>
            !graph.edges.some((e) => e.id === edge.id) &&
            edge.source &&
            edge.target
        );

        const positioned = positionForNewNodes(newNodes);
        if (positioned.length > 0) useGraphStore.getState().addNodes(positioned);
        if (newEdges.length > 0) useGraphStore.getState().addEdges(newEdges);
        recalculateAll();

        const summary = `Expanded node with ${positioned.length} new sources (${intent.mode})`;

        const expandedNodeIds = positioned.map((n) => n.id);
        const expandedEdgeIds = newEdges.map((e) => e.id);
        const expandedNodes = positioned.map((n) => ({ ...n }));
        const expandedEdges = newEdges.map((e) => ({ ...e }));

        if (expandedNodeIds.length > 0 || expandedEdgeIds.length > 0) {
          useHistoryStore.getState().push({
            description: summary,
            undo: () => {
              if (expandedEdgeIds.length > 0) {
                useGraphStore.getState().removeEdges(expandedEdgeIds);
              }
              if (expandedNodeIds.length > 0) {
                useGraphStore.getState().removeNodes(expandedNodeIds);
              }
              recalculateAll();
            },
            redo: () => {
              if (expandedNodes.length > 0) useGraphStore.getState().addNodes(expandedNodes);
              if (expandedEdges.length > 0) useGraphStore.getState().addEdges(expandedEdges);
              recalculateAll();
            },
          });
        }

        return {
          applied: true,
          summary,
          addedNodeIds: expandedNodeIds,
          addedEdgeIds: expandedEdgeIds,
        };
      }

      case "archive-node": {
        const archiveGraph = useGraphStore.getState();
        const archiveNode = archiveGraph.nodes.get(intent.nodeId);
        const previousState = archiveNode?.state ?? "materialized";

        useGraphStore.getState().archiveNode(intent.nodeId);
        const summary = `Archived source ${intent.nodeId.slice(0, 8)}`;

        const archivedNodeId = intent.nodeId;
        useHistoryStore.getState().push({
          description: summary,
          undo: () => {
            useGraphStore.getState().updateNodeState(archivedNodeId, previousState);
          },
          redo: () => {
            useGraphStore.getState().archiveNode(archivedNodeId);
          },
        });

        return { applied: true, summary };
      }

      case "relayout": {
        const graph = useGraphStore.getState();
        const positions = computeLayout(graph.nodes, graph.edges, graph.clusters, {
          width: 1200,
          height: 800,
          iterations: 120,
        });
        useGraphStore.getState().updateNodePositions(positions);
        const summary = "Relayout applied to graph";
        return { applied: true, summary };
      }

      case "merge-clusters": {
        return { applied: false, summary: "Merge clusters not yet implemented" };
      }

      case "add-contradiction": {
        return { applied: false, summary: "Add contradiction not yet implemented" };
      }

      case "save-for-later": {
        return { applied: false, summary: "Save for later not yet implemented" };
      }
    }
  } catch (error) {
    if (intent.type === "expand-node") {
      useGraphStore.getState().clearExpanding(intent.nodeId);
    }
    const message = error instanceof Error ? error.message : "Command failed";
    return {
      applied: false,
      summary: "Command failed",
      error: message,
    };
  }
}
