/**
 * Graph snapshot helpers: serialize and deserialize the full graph store
 * state for persistence (e.g. in Cloudflare R2).
 */

import type {
  PaperNode,
  GraphEdge,
  Cluster,
  WeightConfig,
  AnnotationNode,
} from "@/types";
import { DEFAULT_WEIGHTS } from "@/types";
import { useGraphStore } from "@/store/graph-store";

export interface GraphSnapshot {
  version: 1;
  nodes: PaperNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
  weights: WeightConfig;
  query: string;
  annotationNodes: AnnotationNode[];
  updatedAt: number;
}

/** Serialize the current graph store state into a plain, JSON-safe snapshot. */
export function graphStoreToSnapshot(): GraphSnapshot {
  const state = useGraphStore.getState();
  return {
    version: 1,
    nodes: Array.from(state.nodes.values()),
    edges: state.edges,
    clusters: state.clusters,
    weights: state.weights,
    query: state.query,
    annotationNodes: Array.from(state.annotationNodes.values()),
    updatedAt: Date.now(),
  };
}

/**
 * Apply a graph snapshot to the graph store.
 * Clears the current graph, then loads the snapshot into the store.
 */
export function applySnapshotToStore(snapshot: GraphSnapshot): void {
  const store = useGraphStore.getState();

  store.clearGraph();

  if (snapshot.nodes.length > 0) {
    store.addNodes(snapshot.nodes);
  }
  if (snapshot.edges.length > 0) {
    store.addEdges(snapshot.edges);
  }
  if (snapshot.clusters.length > 0) {
    store.setClusters(snapshot.clusters);
  }

  store.setWeights(snapshot.weights ?? DEFAULT_WEIGHTS);

  if (snapshot.query) {
    store.setQuery(snapshot.query);
  }

  if (snapshot.annotationNodes?.length > 0) {
    store.setAnnotationNodes(snapshot.annotationNodes);
  }
}

/**
 * Validate that a parsed object looks like a GraphSnapshot.
 * Returns the snapshot if valid, null otherwise.
 */
export function parseGraphSnapshot(raw: unknown): GraphSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) return null;
  if (!Array.isArray(obj.nodes)) return null;
  if (!Array.isArray(obj.edges)) return null;
  if (!Array.isArray(obj.clusters)) return null;
  if (!obj.weights || typeof obj.weights !== "object") return null;
  return obj as unknown as GraphSnapshot;
}
