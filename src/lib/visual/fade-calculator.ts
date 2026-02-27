import type { GraphEdge } from "@/types";

export function computeHopDistances(
  focusNodeId: string,
  edges: GraphEdge[],
  nodeIds: Set<string>
): Map<string, number> {
  const distances = new Map<string, number>();
  distances.set(focusNodeId, 0);

  // Build adjacency
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      adj.get(edge.source)!.push(edge.target);
      adj.get(edge.target)!.push(edge.source);
    }
  }

  // BFS
  const queue = [focusNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const dist = distances.get(current)!;
    for (const neighbor of (adj.get(current) || [])) {
      if (!distances.has(neighbor)) {
        distances.set(neighbor, dist + 1);
        queue.push(neighbor);
      }
    }
  }

  return distances;
}

export function getNodeOpacity(hopDistance: number | undefined, maxHops: number): number {
  if (hopDistance === undefined) return 0.12;
  if (hopDistance === 0) return 1.0;
  if (hopDistance === 1) return 0.9;
  if (hopDistance === 2) return 0.6;
  if (hopDistance === 3) return 0.3;
  return hopDistance <= maxHops ? 0.2 : 0.12;
}
