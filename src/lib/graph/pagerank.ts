import type { PaperNode, GraphEdge } from "@/types";

/**
 * Compute PageRank over the local graph.
 * Returns a Map of nodeId -> PageRank score.
 */
export function computePageRank(
  nodes: PaperNode[] | Map<string, PaperNode>,
  edges: GraphEdge[],
  damping = 0.85,
  iterations = 20
): Map<string, number> {
  const nodeIds: string[] = [];

  if (nodes instanceof Map) {
    for (const id of nodes.keys()) {
      nodeIds.push(id);
    }
  } else {
    for (const node of nodes) {
      nodeIds.push(node.id);
    }
  }

  const n = nodeIds.length;
  if (n === 0) return new Map();

  const nodeSet = new Set(nodeIds);

  // Build adjacency: outgoing links from each node
  const outLinks = new Map<string, string[]>();
  for (const id of nodeIds) {
    outLinks.set(id, []);
  }

  for (const edge of edges) {
    if (nodeSet.has(edge.source) && nodeSet.has(edge.target)) {
      outLinks.get(edge.source)!.push(edge.target);
      // For undirected semantic edges, add reverse too
      if (
        edge.type === "semantic-similarity" ||
        edge.type === "same-author" ||
        edge.type === "same-venue"
      ) {
        outLinks.get(edge.target)!.push(edge.source);
      }
    }
  }

  // Initialize scores
  const scores = new Map<string, number>();
  const initial = 1 / n;
  for (const id of nodeIds) {
    scores.set(id, initial);
  }

  // Iterate
  for (let iter = 0; iter < iterations; iter++) {
    const newScores = new Map<string, number>();
    const basePR = (1 - damping) / n;

    for (const id of nodeIds) {
      newScores.set(id, basePR);
    }

    for (const id of nodeIds) {
      const links = outLinks.get(id)!;
      if (links.length === 0) {
        // Dangling node: distribute evenly
        const share = (damping * scores.get(id)!) / n;
        for (const otherId of nodeIds) {
          newScores.set(otherId, newScores.get(otherId)! + share);
        }
      } else {
        const share = (damping * scores.get(id)!) / links.length;
        for (const target of links) {
          newScores.set(target, newScores.get(target)! + share);
        }
      }
    }

    for (const id of nodeIds) {
      scores.set(id, newScores.get(id)!);
    }
  }

  return scores;
}
