import { nanoid } from "nanoid";
import type {
  AppliedChangeEvent,
  EdgeTrust,
  GraphCommandIntent,
  GraphCommandResult,
  GraphEdge,
  NodeScores,
  PaperMetadata,
  PaperNode,
} from "@/types";
import { computeLayout, incrementalLayout } from "@/lib/graph/layout";
import { mergeClusters } from "@/lib/graph/clustering";
import {
  persistAddEdges,
  persistAddNodes,
  persistRemoveEdges,
  persistRemoveNodes,
  persistSetClusters,
  persistUpdateNodeData,
  persistUpdateNodePositions,
  persistUpdateNodeState,
} from "@/lib/db/graph-actions";
import { createNodeFromUrl } from "@/lib/utils/url-source";
import { useGraphStore } from "@/store/graph-store";
import { useRabbitHoleStore } from "@/store/rabbit-hole-store";
import { useWorkflowStore } from "@/store/workflow-store";
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

function currentRabbitHoleId(): string | null {
  return useRabbitHoleStore.getState().currentRabbitHoleId;
}

function emitAppliedChange(
  actionType: string,
  summary: string,
  source: "chat" | "canvas" | "system",
  payload?: Record<string, unknown>
) {
  const rabbitHoleId = currentRabbitHoleId();
  if (!rabbitHoleId) return;

  const event: AppliedChangeEvent = {
    id: `change-${nanoid(10)}`,
    rabbitHoleId,
    source,
    actionType,
    summary,
    payload,
    createdAt: now(),
  };
  useWorkflowStore.getState().addAppliedChange(event);

  const conn = useRabbitHoleStore.getState().dbConnection as unknown as {
    reducers?: Record<string, (...args: unknown[]) => void>;
  } | null;
  const reducer = conn?.reducers?.appendActionEvent as
    | ((args: {
        rabbitHoleId: string;
        eventId: string;
        source: string;
        actionType: string;
        summary: string;
        payloadJson?: string;
        createdAt: bigint;
      }) => void)
    | undefined;
  if (reducer) {
    reducer({
      rabbitHoleId,
      eventId: event.id,
      source,
      actionType,
      summary,
      payloadJson: payload ? JSON.stringify(payload) : undefined,
      createdAt: BigInt(event.createdAt),
    });
  }
}

function recalculateAndPersistClusters() {
  const store = useGraphStore.getState();
  store.recalculateScores();
  store.recalculateClusters();
  persistSetClusters(useGraphStore.getState().clusters);
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

function ensureUrlPaper(url: string, title?: string, snippet?: string): PaperMetadata {
  const node = createNodeFromUrl(url, {
    url,
    title: title ?? url,
    description: snippet,
    isPdf: /\.pdf(\?|#|$)/i.test(url),
    siteName: (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, "");
      } catch {
        return "source";
      }
    })(),
  });
  return node.data;
}

function mergePaperMetadata(base: PaperMetadata, incoming: PaperMetadata): PaperMetadata {
  return {
    ...base,
    id: base.id,
    externalIds: {
      ...base.externalIds,
      ...incoming.externalIds,
    },
    title: base.title || incoming.title,
    authors: base.authors.length > 0 ? base.authors : incoming.authors,
    year: base.year ?? incoming.year,
    abstract: base.abstract ?? incoming.abstract,
    tldr: base.tldr ?? incoming.tldr,
    venue: base.venue ?? incoming.venue,
    citationCount: Math.max(base.citationCount, incoming.citationCount),
    referenceCount: Math.max(base.referenceCount, incoming.referenceCount),
    influentialCitationCount:
      base.influentialCitationCount ?? incoming.influentialCitationCount,
    fieldsOfStudy: base.fieldsOfStudy ?? incoming.fieldsOfStudy,
    publicationTypes: base.publicationTypes ?? incoming.publicationTypes,
    openAccessPdf: base.openAccessPdf ?? incoming.openAccessPdf,
    url: base.url ?? incoming.url,
    embedding: base.embedding ?? incoming.embedding,
    ogImage: base.ogImage ?? incoming.ogImage,
    faviconUrl: base.faviconUrl ?? incoming.faviconUrl,
    siteDescription: base.siteDescription ?? incoming.siteDescription,
    siteName: base.siteName ?? incoming.siteName,
    isUrlSource: base.isUrlSource ?? incoming.isUrlSource,
    fetchedContent: base.fetchedContent ?? incoming.fetchedContent,
    contentTruncated: base.contentTruncated ?? incoming.contentTruncated,
  };
}

function shouldHydratePaperMetadata(paper: PaperMetadata): boolean {
  const id = paper.id || "";
  if (!id) return false;
  if (id.startsWith("url-") || id.startsWith("title:") || id.startsWith("paper-")) {
    return false;
  }
  return (
    !paper.url ||
    paper.authors.length === 0 ||
    !paper.abstract ||
    paper.citationCount === 0
  );
}

async function hydratePaperMetadata(paper: PaperMetadata): Promise<PaperMetadata> {
  if (!shouldHydratePaperMetadata(paper)) return paper;
  try {
    const res = await fetch(`/api/papers/${encodeURIComponent(paper.id)}`);
    if (!res.ok) return paper;
    const json = (await res.json()) as {
      status?: "success" | "error";
      data?: PaperMetadata;
    };
    if (json.status !== "success" || !json.data) return paper;
    return mergePaperMetadata(paper, json.data);
  } catch {
    return paper;
  }
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

function upsertEvidenceStatus(cardId: string | undefined, status: "added" | "contradiction" | "saved") {
  if (!cardId) return;
  useWorkflowStore.getState().setEvidenceCardStatus(cardId, status);
}

export async function executeGraphCommand(intent: GraphCommandIntent): Promise<GraphCommandResult> {
  try {
    switch (intent.type) {
      case "add-node": {
        const candidatePaper = await hydratePaperMetadata(intent.paper);
        const graph = useGraphStore.getState();
        const existing = graph.nodes.get(candidatePaper.id);
        if (existing) {
          const mergedData = mergePaperMetadata(existing.data, candidatePaper);
          const metadataImproved =
            mergedData.url !== existing.data.url ||
            mergedData.openAccessPdf !== existing.data.openAccessPdf ||
            mergedData.abstract !== existing.data.abstract ||
            mergedData.authors.length !== existing.data.authors.length ||
            mergedData.citationCount !== existing.data.citationCount ||
            mergedData.referenceCount !== existing.data.referenceCount;
          if (metadataImproved) {
            const nodes = new Map(graph.nodes);
            nodes.set(existing.id, { ...existing, data: mergedData });
            useGraphStore.setState({ nodes });
            persistUpdateNodeData(existing.id);
          }
          if (intent.materialize && existing.state !== "materialized") {
            persistUpdateNodeState(existing.id, "materialized");
          }
          upsertEvidenceStatus(intent.evidenceCardId, "added");
          const summary = `Source already in graph: ${candidatePaper.title}`;
          emitAppliedChange("add-node", summary, intent.source ?? "system", {
            nodeId: existing.id,
            duplicate: true,
            metadataUpdated: metadataImproved || undefined,
          });
          return { applied: true, summary, addedNodeIds: [existing.id] };
        }

        const state = intent.materialize ? "materialized" : "discovered";
        const node = makePaperNode(candidatePaper, state);
        const [positioned] = positionForNewNodes([node]);
        persistAddNodes([positioned]);
        recalculateAndPersistClusters();
        upsertEvidenceStatus(intent.evidenceCardId, "added");
        const summary = `Added source: ${candidatePaper.title}`;
        emitAppliedChange("add-node", summary, intent.source ?? "system", {
          nodeId: positioned.id,
        });

        // Push undo entry: undo = remove the added node
        const addedNodeId = positioned.id;
        const addedPaper = candidatePaper;
        const addedState = state;
        useHistoryStore.getState().push({
          description: summary,
          undo: () => {
            persistRemoveNodes([addedNodeId]);
            recalculateAndPersistClusters();
          },
          redo: () => {
            const redoNode = makePaperNode(addedPaper, addedState);
            persistAddNodes([{ ...redoNode, position: positioned.position }]);
            recalculateAndPersistClusters();
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
        persistAddEdges([edge]);
        recalculateAndPersistClusters();
        const summary = `Connected ${intent.sourceId.slice(0, 8)} -> ${intent.targetId.slice(0, 8)}`;
        emitAppliedChange("connect-nodes", summary, intent.source ?? "system", {
          edgeId: edge.id,
          edgeType: edge.type,
        });
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
        if (positioned.length > 0) persistAddNodes(positioned);
        if (newEdges.length > 0) persistAddEdges(newEdges);
        recalculateAndPersistClusters();

        const summary = `Expanded node with ${positioned.length} new sources (${intent.mode})`;
        emitAppliedChange("expand-node", summary, intent.source ?? "system", {
          nodeId: intent.nodeId,
          mode: intent.mode,
          nodesAdded: positioned.length,
          edgesAdded: newEdges.length,
        });

        // Push undo entry: undo = remove all newly added nodes and edges
        const expandedNodeIds = positioned.map((n) => n.id);
        const expandedEdgeIds = newEdges.map((e) => e.id);
        const expandedNodes = positioned.map((n) => ({ ...n }));
        const expandedEdges = newEdges.map((e) => ({ ...e }));
        if (expandedNodeIds.length > 0 || expandedEdgeIds.length > 0) {
          useHistoryStore.getState().push({
            description: summary,
            undo: () => {
              if (expandedEdgeIds.length > 0) {
                persistRemoveEdges(expandedEdgeIds);
              }
              if (expandedNodeIds.length > 0) {
                persistRemoveNodes(expandedNodeIds);
              }
              recalculateAndPersistClusters();
            },
            redo: () => {
              if (expandedNodes.length > 0) persistAddNodes(expandedNodes);
              if (expandedEdges.length > 0) persistAddEdges(expandedEdges);
              recalculateAndPersistClusters();
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

      case "merge-clusters": {
        const graph = useGraphStore.getState();
        const merged = mergeClusters(
          graph.clusters,
          intent.clusterIdA,
          intent.clusterIdB,
          graph.nodes
        );
        const nodeCluster = new Map<string, string>();
        for (const cluster of merged) {
          for (const nodeId of cluster.nodeIds) {
            nodeCluster.set(nodeId, cluster.id);
          }
        }
        const nodes = new Map(graph.nodes);
        for (const [nodeId, clusterId] of nodeCluster) {
          const node = nodes.get(nodeId);
          if (node) nodes.set(nodeId, { ...node, clusterId });
        }
        useGraphStore.setState({ nodes });
        persistSetClusters(merged);
        const summary = `Merged clusters ${intent.clusterIdA.slice(0, 8)} and ${intent.clusterIdB.slice(0, 8)}`;
        emitAppliedChange("merge-clusters", summary, intent.source ?? "system", {
          clusterIdA: intent.clusterIdA,
          clusterIdB: intent.clusterIdB,
        });
        return { applied: true, summary };
      }

      case "archive-node": {
        // Capture previous state for undo
        const archiveGraph = useGraphStore.getState();
        const archiveNode = archiveGraph.nodes.get(intent.nodeId);
        const previousState = archiveNode?.state ?? "materialized";

        persistUpdateNodeState(intent.nodeId, "archived");
        const summary = `Archived source ${intent.nodeId.slice(0, 8)}`;
        emitAppliedChange("archive-node", summary, intent.source ?? "system", {
          nodeId: intent.nodeId,
        });

        // Push undo entry: undo = restore the previous state
        const archivedNodeId = intent.nodeId;
        useHistoryStore.getState().push({
          description: summary,
          undo: () => {
            persistUpdateNodeState(archivedNodeId, previousState);
          },
          redo: () => {
            persistUpdateNodeState(archivedNodeId, "archived");
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
        persistUpdateNodePositions(positions);
        const summary = "Relayout applied to graph";
        emitAppliedChange("relayout", summary, intent.source ?? "system", {
          nodes: positions.size,
        });
        return { applied: true, summary };
      }

      case "add-contradiction": {
        const anchor = intent.anchorNodeId;
        const paper =
          intent.paper ??
          (intent.url
            ? ensureUrlPaper(intent.url, intent.title, intent.snippet)
            : undefined);
        if (!paper) {
          return { applied: false, summary: "No contradiction source provided", error: "Missing paper/url" };
        }

        const addResult = await executeGraphCommand({
          type: "add-node",
          paper,
          materialize: false,
          source: intent.source,
          evidenceCardId: intent.evidenceCardId,
        });
        if (!addResult.applied) return addResult;
        const contradictionNodeId = addResult.addedNodeIds?.[0];

        if (anchor && contradictionNodeId && anchor !== contradictionNodeId) {
          const edge = graphEdge(
            anchor,
            contradictionNodeId,
            "contradicts",
            "inferred",
            0.8,
            intent.snippet
          );
          persistAddEdges([edge]);
          recalculateAndPersistClusters();
        }

        upsertEvidenceStatus(intent.evidenceCardId, "contradiction");
        const summary = anchor
          ? `Added contradiction and linked to ${anchor.slice(0, 8)}`
          : "Added contradiction source";
        emitAppliedChange("add-contradiction", summary, intent.source ?? "system", {
          anchorNodeId: anchor,
          contradictionNodeId,
        });
        return {
          applied: true,
          summary,
          addedNodeIds: contradictionNodeId ? [contradictionNodeId] : [],
        };
      }

      case "save-for-later": {
        useWorkflowStore.getState().setEvidenceCardStatus(intent.evidenceCardId, "saved");
        const summary = "Saved source for later";
        emitAppliedChange("save-for-later", summary, intent.source ?? "system", {
          evidenceCardId: intent.evidenceCardId,
        });
        return { applied: true, summary };
      }
    }
  } catch (error) {
    // Clear any in-flight expanding state on unexpected errors
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
