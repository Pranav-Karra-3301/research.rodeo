import { create } from "zustand";
import type {
  PaperNode,
  GraphEdge,
  Cluster,
  WeightConfig,
  NodeState,
  NodeScores,
  AnnotationNode,
} from "@/types";
import { DEFAULT_WEIGHTS } from "@/types";
import {
  computeNodeScore,
  normalizeScores,
  computeRawScores,
  computeAuthorBoosts,
  computeClusterBoosts,
} from "@/lib/graph/scoring";
import { computePageRank } from "@/lib/graph/pagerank";
import { detectCommunities } from "@/lib/graph/clustering";

interface GraphState {
  // --- State ---
  nodes: Map<string, PaperNode>;
  edges: GraphEdge[];
  clusters: Cluster[];
  weights: WeightConfig;
  selectedNodeId: string | null;
  selectedNodeIds: Set<string>;
  hoveredNodeId: string | null;
  focusNodeId: string | null;
  annotationNodes: Map<string, AnnotationNode>;
  query: string;
  queryEmbedding: number[] | null;
  isLoading: boolean;
  expandingNodeIds: Set<string>;
  lastMaterializedNodeId: string | null;

  // --- Actions ---
  addNodes: (nodes: PaperNode[]) => void;
  removeNodes: (nodeIds: string[]) => void;
  addEdges: (edges: GraphEdge[]) => void;
  removeEdges: (edgeIds: string[]) => void;
  updateNodeState: (nodeId: string, state: NodeState) => void;
  updateNodeScores: (nodeId: string, scores: Partial<NodeScores>) => void;
  setWeights: (weights: WeightConfig) => void;
  selectNode: (nodeId: string | null) => void;
  toggleNodeSelection: (nodeId: string) => void;
  selectAllNodes: () => void;
  clearSelection: () => void;
  hoverNode: (nodeId: string | null) => void;
  expandNode: (nodeId: string) => void;
  materializeNode: (nodeId: string) => void;
  archiveNode: (nodeId: string) => void;
  setQuery: (query: string, embedding?: number[]) => void;
  setLoading: (loading: boolean) => void;
  clearGraph: () => void;
  setClusters: (clusters: Cluster[]) => void;
  recalculateScores: () => void;
  recalculateClusters: () => void;
  updateNodePositions: (positions: Map<string, { x: number; y: number }>) => void;
  setExpanding: (nodeId: string) => void;
  clearExpanding: (nodeId: string) => void;
  clearLastMaterializedNodeId: () => void;

  // --- Focus & Annotation Actions ---
  setFocusNode: (nodeId: string | null) => void;
  addAnnotation: (annotation: AnnotationNode) => void;
  removeAnnotation: (annotationId: string) => void;
  updateAnnotation: (id: string, content: string) => void;
  getAnnotationsForNode: (nodeId: string) => AnnotationNode[];

  // --- Derived Getters ---
  getNode: (nodeId: string) => PaperNode | undefined;
  getNodeEdges: (nodeId: string) => GraphEdge[];
  getFrontierNodes: () => PaperNode[];
  getMaterializedNodes: () => PaperNode[];
  getClusterNodes: (clusterId: string) => PaperNode[];
  getSelectedNode: () => PaperNode | undefined;
  getSortedNodes: () => PaperNode[];
}

export const useGraphStore = create<GraphState>()((set, get) => ({
  // --- Initial State ---
  nodes: new Map(),
  edges: [],
  clusters: [],
  weights: DEFAULT_WEIGHTS,
  selectedNodeId: null,
  selectedNodeIds: new Set(),
  hoveredNodeId: null,
  focusNodeId: null,
  annotationNodes: new Map(),
  query: "",
  queryEmbedding: null,
  isLoading: false,
  expandingNodeIds: new Set(),
  lastMaterializedNodeId: null,

  // --- Actions ---

  addNodes: (newNodes) =>
    set((state) => {
      const nodes = new Map(state.nodes);
      for (const node of newNodes) {
        // Compute raw scores for new nodes
        const scores = computeRawScores(node, state.queryEmbedding ?? undefined);
        nodes.set(node.id, { ...node, scores });
      }
      return { nodes };
    }),

  removeNodes: (nodeIds) =>
    set((state) => {
      const removeSet = new Set(nodeIds);
      const nodes = new Map(state.nodes);
      for (const id of nodeIds) {
        nodes.delete(id);
      }
      // Remove edges connected to removed nodes
      const edges = state.edges.filter(
        (e) => !removeSet.has(e.source) && !removeSet.has(e.target)
      );
      // Remove from clusters
      const clusters = state.clusters
        .map((c) => ({
          ...c,
          nodeIds: c.nodeIds.filter((id) => !removeSet.has(id)),
        }))
        .filter((c) => c.nodeIds.length > 0);
      // Clear selection if removed
      const selectedNodeId = removeSet.has(state.selectedNodeId ?? "")
        ? null
        : state.selectedNodeId;
      // Clean up multi-selection
      const selectedNodeIds = new Set(state.selectedNodeIds);
      for (const id of nodeIds) {
        selectedNodeIds.delete(id);
      }
      return { nodes, edges, clusters, selectedNodeId, selectedNodeIds };
    }),

  addEdges: (newEdges) =>
    set((state) => {
      const existingIds = new Set(state.edges.map((e) => e.id));
      const deduped = newEdges.filter((e) => !existingIds.has(e.id));
      return { edges: [...state.edges, ...deduped] };
    }),

  removeEdges: (edgeIds) =>
    set((state) => {
      const removeSet = new Set(edgeIds);
      return { edges: state.edges.filter((e) => !removeSet.has(e.id)) };
    }),

  updateNodeState: (nodeId, newState) =>
    set((state) => {
      const node = state.nodes.get(nodeId);
      if (!node) return state;
      const nodes = new Map(state.nodes);
      nodes.set(nodeId, { ...node, state: newState });
      return { nodes };
    }),

  updateNodeScores: (nodeId, partialScores) =>
    set((state) => {
      const node = state.nodes.get(nodeId);
      if (!node) return state;
      const nodes = new Map(state.nodes);
      nodes.set(nodeId, {
        ...node,
        scores: { ...node.scores, ...partialScores },
      });
      return { nodes };
    }),

  setWeights: (weights) => set({ weights }),

  selectNode: (nodeId) => set({ selectedNodeId: nodeId, selectedNodeIds: new Set() }),

  toggleNodeSelection: (nodeId) =>
    set((state) => {
      const next = new Set(state.selectedNodeIds);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return { selectedNodeIds: next, selectedNodeId: null };
    }),

  selectAllNodes: () =>
    set((state) => {
      const allVisible = new Set<string>();
      for (const [id, node] of state.nodes) {
        if (node.state !== "archived") {
          allVisible.add(id);
        }
      }
      return { selectedNodeIds: allVisible, selectedNodeId: null };
    }),

  clearSelection: () => set({ selectedNodeIds: new Set(), selectedNodeId: null }),

  hoverNode: (nodeId) => set({ hoveredNodeId: nodeId }),

  expandNode: (nodeId) =>
    set((state) => {
      const node = state.nodes.get(nodeId);
      if (!node) return state;
      const nodes = new Map(state.nodes);
      nodes.set(nodeId, {
        ...node,
        state: "enriched",
        expandedAt: Date.now(),
      });
      return { nodes };
    }),

  materializeNode: (nodeId) =>
    set((state) => {
      const node = state.nodes.get(nodeId);
      if (!node) return state;
      const nodes = new Map(state.nodes);
      let position = node.position;
      // If node has no meaningful position (e.g. was only in frontier list), place it visibly
      const atOrigin = position.x === 0 && position.y === 0;
      if (atOrigin) {
        const materialized = Array.from(state.nodes.values()).filter(
          (n) => n.state === "materialized" && n.id !== nodeId
        );
        if (materialized.length > 0) {
          const cx =
            materialized.reduce((s, n) => s + n.position.x, 0) /
            materialized.length;
          const cy =
            materialized.reduce((s, n) => s + n.position.y, 0) /
            materialized.length;
          position = {
            x: cx + (Math.random() - 0.5) * 220,
            y: cy + (Math.random() - 0.5) * 220,
          };
        } else {
          position = { x: 400, y: 300 };
        }
      }
      nodes.set(nodeId, { ...node, state: "materialized", position });
      return { nodes, lastMaterializedNodeId: nodeId };
    }),

  archiveNode: (nodeId) =>
    set((state) => {
      const node = state.nodes.get(nodeId);
      if (!node) return state;
      const nodes = new Map(state.nodes);
      nodes.set(nodeId, { ...node, state: "archived" });
      return { nodes };
    }),

  setQuery: (query, embedding) =>
    set({ query, queryEmbedding: embedding ?? null }),

  setLoading: (isLoading) => set({ isLoading }),

  clearGraph: () =>
    set({
      nodes: new Map(),
      edges: [],
      clusters: [],
      selectedNodeId: null,
      selectedNodeIds: new Set(),
      hoveredNodeId: null,
      focusNodeId: null,
      annotationNodes: new Map(),
      expandingNodeIds: new Set(),
      lastMaterializedNodeId: null,
    }),

  setClusters: (clusters) => set({ clusters }),

  recalculateScores: () =>
    set((state) => {
      const nodes = new Map(state.nodes);

      // Compute PageRank for local centrality
      const pageRanks = computePageRank(nodes, state.edges);

      // Update local centrality from PageRank
      for (const [id, rank] of pageRanks) {
        const node = nodes.get(id);
        if (node) {
          nodes.set(id, {
            ...node,
            scores: { ...node.scores, localCentrality: rank },
          });
        }
      }

      // Normalize across all nodes
      const nodeArray = Array.from(nodes.values());
      normalizeScores(nodeArray);

      // Compute composite relevance scores
      for (const node of nodeArray) {
        const relevance = computeNodeScore(
          node,
          state.weights,
          state.queryEmbedding ?? undefined
        );
        node.scores.relevance = relevance;
      }

      // Apply author-network and cluster-size boosts
      const authorBoosts = computeAuthorBoosts(nodeArray);
      const clusterBoosts = computeClusterBoosts(nodeArray, state.clusters);

      for (const node of nodeArray) {
        const authorMul = authorBoosts.get(node.id) ?? 1;
        const clusterMul = clusterBoosts.get(node.id) ?? 1;
        node.scores.relevance = Math.min(node.scores.relevance * authorMul * clusterMul, 1);
        nodes.set(node.id, node);
      }

      return { nodes };
    }),

  recalculateClusters: () =>
    set((state) => {
      const clusters = detectCommunities(state.nodes, state.edges);
      // Update clusterId on each node
      const nodes = new Map(state.nodes);
      for (const cluster of clusters) {
        for (const nodeId of cluster.nodeIds) {
          const node = nodes.get(nodeId);
          if (node) {
            nodes.set(nodeId, { ...node, clusterId: cluster.id });
          }
        }
      }
      return { clusters, nodes };
    }),

  updateNodePositions: (positions) =>
    set((state) => {
      const nodes = new Map(state.nodes);
      for (const [id, pos] of positions) {
        const node = nodes.get(id);
        if (node) {
          nodes.set(id, { ...node, position: pos });
        }
      }
      return { nodes };
    }),

  setExpanding: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandingNodeIds);
      next.add(nodeId);
      return { expandingNodeIds: next };
    }),

  clearExpanding: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandingNodeIds);
      next.delete(nodeId);
      return { expandingNodeIds: next };
    }),

  clearLastMaterializedNodeId: () => set({ lastMaterializedNodeId: null }),

  // --- Focus & Annotation Actions ---

  setFocusNode: (nodeId) => set({ focusNodeId: nodeId }),

  addAnnotation: (annotation) =>
    set((state) => {
      const annotationNodes = new Map(state.annotationNodes);
      annotationNodes.set(annotation.id, annotation);
      return { annotationNodes };
    }),

  removeAnnotation: (annotationId) =>
    set((state) => {
      const annotationNodes = new Map(state.annotationNodes);
      annotationNodes.delete(annotationId);
      return { annotationNodes };
    }),

  updateAnnotation: (id, content) =>
    set((state) => {
      const annotation = state.annotationNodes.get(id);
      if (!annotation) return state;
      const annotationNodes = new Map(state.annotationNodes);
      annotationNodes.set(id, { ...annotation, content });
      return { annotationNodes };
    }),

  getAnnotationsForNode: (nodeId) => {
    const { annotationNodes } = get();
    return Array.from(annotationNodes.values()).filter(
      (a) => a.attachedToNodeId === nodeId
    );
  },

  // --- Derived Getters ---

  getNode: (nodeId) => get().nodes.get(nodeId),

  getNodeEdges: (nodeId) =>
    get().edges.filter((e) => e.source === nodeId || e.target === nodeId),

  getFrontierNodes: () =>
    Array.from(get().nodes.values()).filter(
      (n) => n.state === "discovered" || n.state === "enriched"
    ),

  getMaterializedNodes: () =>
    Array.from(get().nodes.values()).filter(
      (n) => n.state === "materialized"
    ),

  getClusterNodes: (clusterId) =>
    Array.from(get().nodes.values()).filter(
      (n) => n.clusterId === clusterId
    ),

  getSelectedNode: () => {
    const { selectedNodeId, nodes } = get();
    return selectedNodeId ? nodes.get(selectedNodeId) : undefined;
  },

  getSortedNodes: () =>
    Array.from(get().nodes.values()).sort(
      (a, b) => b.scores.relevance - a.scores.relevance
    ),
}));
