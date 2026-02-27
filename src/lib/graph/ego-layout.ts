import {
  forceSimulation,
  forceCollide,
  forceRadial,
  type SimulationNodeDatum,
} from "d3-force";
import type { PaperNode, GraphEdge } from "@/types";

interface EgoLayoutOptions {
  ringRadius?: number;
  maxHops?: number;
}

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
}

export function classifyNeighbors(
  focusId: string,
  edges: GraphEdge[]
): { parents: string[]; children: string[]; siblings: string[] } {
  const parents: string[] = [];
  const children: string[] = [];
  const siblings: string[] = [];

  for (const edge of edges) {
    if (edge.source === focusId) {
      // Edge FROM focus -> these are children (cites) or siblings (semantic)
      if (edge.type === "semantic-similarity" || edge.type === "same-author" || edge.type === "same-venue") {
        siblings.push(edge.target);
      } else {
        children.push(edge.target);
      }
    } else if (edge.target === focusId) {
      // Edge TO focus -> these are parents (cited-by) or siblings
      if (edge.type === "semantic-similarity" || edge.type === "same-author" || edge.type === "same-venue") {
        if (!siblings.includes(edge.source)) siblings.push(edge.source);
      } else {
        parents.push(edge.source);
      }
    }
  }

  return { parents, children, siblings };
}

export function computeEgoLayout(
  focusNodeId: string,
  nodes: Map<string, PaperNode>,
  edges: GraphEdge[],
  options?: EgoLayoutOptions
): Map<string, { x: number; y: number }> {
  const RING_RADIUS = options?.ringRadius ?? 300;
  const maxHops = options?.maxHops ?? 3;
  const positions = new Map<string, { x: number; y: number }>();

  if (!nodes.has(focusNodeId)) return positions;

  // 1. BFS to compute hop distances
  const hopDistances = new Map<string, number>();
  hopDistances.set(focusNodeId, 0);
  const adj = new Map<string, string[]>();
  for (const id of nodes.keys()) adj.set(id, []);
  for (const edge of edges) {
    if (nodes.has(edge.source) && nodes.has(edge.target)) {
      adj.get(edge.source)!.push(edge.target);
      adj.get(edge.target)!.push(edge.source);
    }
  }
  const queue = [focusNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const dist = hopDistances.get(current)!;
    if (dist >= maxHops) continue;
    for (const neighbor of (adj.get(current) || [])) {
      if (!hopDistances.has(neighbor)) {
        hopDistances.set(neighbor, dist + 1);
        queue.push(neighbor);
      }
    }
  }

  // 2. Classify hop-1 neighbors
  const { parents, children, siblings } = classifyNeighbors(focusNodeId, edges);

  // 3. Focus at center
  positions.set(focusNodeId, { x: 0, y: 0 });

  // 4. Parents fanned in arc above (y = -RING_RADIUS)
  fanInArc(parents, 0, -RING_RADIUS, RING_RADIUS * 0.8, Math.PI * 0.6, positions);

  // 5. Children fanned in arc below (y = +RING_RADIUS)
  fanInArc(children, 0, RING_RADIUS, RING_RADIUS * 0.8, Math.PI * 0.6, positions);

  // 6. Siblings to the sides
  const leftSiblings = siblings.filter((_, i) => i % 2 === 0);
  const rightSiblings = siblings.filter((_, i) => i % 2 === 1);
  fanInArc(leftSiblings, -RING_RADIUS, 0, RING_RADIUS * 0.5, Math.PI * 0.4, positions);
  fanInArc(rightSiblings, RING_RADIUS, 0, RING_RADIUS * 0.5, Math.PI * 0.4, positions);

  // 7. Hop-2+ nodes positioned around their hop-1 parent
  for (const [nodeId, hop] of hopDistances) {
    if (hop <= 1 || positions.has(nodeId)) continue;
    // Find closest hop-1 parent that has a position
    const parentId = (adj.get(nodeId) || []).find(
      (n) => hopDistances.get(n) === hop - 1 && positions.has(n)
    );
    if (parentId) {
      const parentPos = positions.get(parentId)!;
      const angle = Math.random() * Math.PI * 2;
      const radius = RING_RADIUS * 0.4 * hop;
      positions.set(nodeId, {
        x: parentPos.x + Math.cos(angle) * radius,
        y: parentPos.y + Math.sin(angle) * radius,
      });
    } else {
      // Place around center at larger radius
      const angle = Math.random() * Math.PI * 2;
      positions.set(nodeId, {
        x: Math.cos(angle) * RING_RADIUS * hop,
        y: Math.sin(angle) * RING_RADIUS * hop,
      });
    }
  }

  // Place unreachable nodes far out
  for (const id of nodes.keys()) {
    if (!positions.has(id)) {
      const angle = Math.random() * Math.PI * 2;
      const r = RING_RADIUS * (maxHops + 1);
      positions.set(id, { x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
  }

  // 8. Run d3-force cleanup (40 iterations) with forceRadial + forceCollide
  const layoutNodes: LayoutNode[] = [];
  for (const [id, pos] of positions) {
    layoutNodes.push({ id, x: pos.x, y: pos.y });
  }

  const sim = forceSimulation<LayoutNode>(layoutNodes)
    .force("collide", forceCollide<LayoutNode>(60))
    .force("radial", forceRadial<LayoutNode>(
      (d) => {
        const hop = hopDistances.get(d.id) ?? maxHops;
        return hop * RING_RADIUS * 0.8;
      },
      0, 0
    ).strength(0.3))
    .stop();

  for (let i = 0; i < 40; i++) sim.tick();

  // Extract cleaned positions (keep focus at 0,0)
  const result = new Map<string, { x: number; y: number }>();
  for (const node of layoutNodes) {
    if (node.id === focusNodeId) {
      result.set(node.id, { x: 0, y: 0 });
    } else {
      result.set(node.id, { x: node.x, y: node.y });
    }
  }

  return result;
}

function fanInArc(
  nodeIds: string[],
  centerX: number,
  centerY: number,
  radius: number,
  arcSpan: number,
  positions: Map<string, { x: number; y: number }>
) {
  if (nodeIds.length === 0) return;
  const startAngle = -arcSpan / 2;
  const step = nodeIds.length === 1 ? 0 : arcSpan / (nodeIds.length - 1);

  for (let i = 0; i < nodeIds.length; i++) {
    const angle = startAngle + step * i;
    // Determine base angle based on center position
    const baseAngle = Math.atan2(centerY, centerX);
    const finalAngle = baseAngle + angle;
    positions.set(nodeIds[i], {
      x: centerX + Math.cos(finalAngle) * radius * 0.3,
      y: centerY + Math.sin(finalAngle) * radius * 0.3,
    });
  }
}
