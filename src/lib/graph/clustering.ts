import type { PaperNode, GraphEdge, Cluster } from "@/types";
import { nanoid } from "nanoid";

// Deterministic color palette for clusters
const CLUSTER_COLORS = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#84cc16", // lime
  "#a855f7", // purple
  "#3b82f6", // blue
];

/**
 * Simple modularity-based community detection (label propagation).
 * Each node starts in its own community, then iteratively adopts
 * the most common community among its neighbors.
 */
export function detectCommunities(
  nodes: Map<string, PaperNode> | PaperNode[],
  edges: GraphEdge[]
): Cluster[] {
  const nodeArray =
    nodes instanceof Map ? Array.from(nodes.values()) : nodes;
  if (nodeArray.length === 0) return [];

  const nodeIds = nodeArray.map((n) => n.id);
  const nodeSet = new Set(nodeIds);

  // Build adjacency with edge weights
  const neighbors = new Map<string, Map<string, number>>();
  for (const id of nodeIds) {
    neighbors.set(id, new Map());
  }

  for (const edge of edges) {
    if (!nodeSet.has(edge.source) || !nodeSet.has(edge.target)) continue;
    const w = edge.weight || 0.5;
    neighbors.get(edge.source)!.set(edge.target, w);
    neighbors.get(edge.target)!.set(edge.source, w);
  }

  // Initialize: each node in its own community
  const community = new Map<string, string>();
  for (const id of nodeIds) {
    community.set(id, id);
  }

  // Label propagation iterations
  const maxIterations = 15;
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Shuffle order for better convergence
    const shuffled = [...nodeIds].sort(() => Math.random() - 0.5);

    for (const id of shuffled) {
      const nbrs = neighbors.get(id)!;
      if (nbrs.size === 0) continue;

      // Count weighted community votes from neighbors
      const votes = new Map<string, number>();
      for (const [nbrId, weight] of nbrs) {
        const nbrComm = community.get(nbrId)!;
        votes.set(nbrComm, (votes.get(nbrComm) || 0) + weight);
      }

      // Pick the community with the highest weighted vote
      let bestComm = community.get(id)!;
      let bestWeight = 0;
      for (const [comm, w] of votes) {
        if (w > bestWeight) {
          bestWeight = w;
          bestComm = comm;
        }
      }

      if (bestComm !== community.get(id)) {
        community.set(id, bestComm);
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Group nodes by community
  const groups = new Map<string, string[]>();
  for (const id of nodeIds) {
    const comm = community.get(id)!;
    if (!groups.has(comm)) groups.set(comm, []);
    groups.get(comm)!.push(id);
  }

  // Convert to Cluster objects
  const nodesMap =
    nodes instanceof Map
      ? nodes
      : new Map(nodeArray.map((n) => [n.id, n]));

  const clusters: Cluster[] = [];
  let colorIdx = 0;
  for (const [, memberIds] of groups) {
    if (memberIds.length === 0) continue;
    const cluster: Cluster = {
      id: `cluster-${nanoid(8)}`,
      label: labelCluster(memberIds, nodesMap),
      nodeIds: memberIds,
      color: CLUSTER_COLORS[colorIdx % CLUSTER_COLORS.length],
    };
    clusters.push(cluster);
    colorIdx++;
  }

  return clusters;
}

/**
 * Assign deterministic colors to clusters.
 */
export function assignClusterColors(clusters: Cluster[]): Cluster[] {
  return clusters.map((cluster, i) => ({
    ...cluster,
    color: CLUSTER_COLORS[i % CLUSTER_COLORS.length],
  }));
}

/**
 * Extract a label for a cluster from common keywords in paper titles.
 * Simple heuristic: find the most frequent non-stopword terms.
 */
export function labelCluster(
  nodeIds: string[],
  nodes: Map<string, PaperNode>
): string {
  const STOPWORDS = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "was", "are", "were", "been",
    "be", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "this", "that",
    "these", "those", "it", "its", "not", "no", "nor", "so", "if", "than",
    "too", "very", "just", "about", "above", "after", "before", "between",
    "into", "through", "during", "out", "off", "over", "under", "again",
    "further", "then", "once", "here", "there", "when", "where", "why",
    "how", "all", "each", "every", "both", "few", "more", "most", "other",
    "some", "such", "only", "own", "same", "up", "down", "we", "our",
    "using", "based", "via", "towards", "toward",
  ]);

  const wordCounts = new Map<string, number>();

  for (const id of nodeIds) {
    const node = nodes.get(id);
    if (!node) continue;
    const words = node.data.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w));

    const seen = new Set<string>();
    for (const word of words) {
      if (seen.has(word)) continue;
      seen.add(word);
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  // Take top 2-3 words
  const sorted = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word[0].toUpperCase() + word.slice(1));

  return sorted.length > 0 ? sorted.join(" / ") : "Uncategorized";
}

/**
 * Merge two clusters into one.
 */
export function mergeClusters(
  clusters: Cluster[],
  clusterIdA: string,
  clusterIdB: string,
  nodes: Map<string, PaperNode>
): Cluster[] {
  const a = clusters.find((c) => c.id === clusterIdA);
  const b = clusters.find((c) => c.id === clusterIdB);
  if (!a || !b) return clusters;

  const mergedNodeIds = [...a.nodeIds, ...b.nodeIds];
  const merged: Cluster = {
    id: a.id,
    label: labelCluster(mergedNodeIds, nodes),
    nodeIds: mergedNodeIds,
    color: a.color,
  };

  return clusters
    .filter((c) => c.id !== clusterIdA && c.id !== clusterIdB)
    .concat(merged);
}

/**
 * Split a cluster by removing specified nodes into a new cluster.
 */
export function splitCluster(
  clusters: Cluster[],
  clusterId: string,
  splitNodeIds: string[],
  nodes: Map<string, PaperNode>
): Cluster[] {
  const original = clusters.find((c) => c.id === clusterId);
  if (!original) return clusters;

  const splitSet = new Set(splitNodeIds);
  const remainingIds = original.nodeIds.filter((id) => !splitSet.has(id));
  const newIds = original.nodeIds.filter((id) => splitSet.has(id));

  if (remainingIds.length === 0 || newIds.length === 0) return clusters;

  const updated: Cluster = {
    ...original,
    nodeIds: remainingIds,
    label: labelCluster(remainingIds, nodes),
  };

  const usedColors = new Set(clusters.map((c) => c.color));
  const availableColor =
    CLUSTER_COLORS.find((c) => !usedColors.has(c)) ||
    CLUSTER_COLORS[clusters.length % CLUSTER_COLORS.length];

  const newCluster: Cluster = {
    id: `cluster-${nanoid(8)}`,
    label: labelCluster(newIds, nodes),
    nodeIds: newIds,
    color: availableColor,
  };

  return clusters
    .filter((c) => c.id !== clusterId)
    .concat(updated, newCluster);
}
