import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from "d3-force";
import type { PaperNode, GraphEdge, Cluster } from "@/types";
import { getNodeDimensions } from "@/lib/visual/importance-size";

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  x: number;
  y: number;
}

interface LayoutLink extends SimulationLinkDatum<LayoutNode> {
  source: string | LayoutNode;
  target: string | LayoutNode;
  weight: number;
}

export interface LayoutOptions {
  width?: number;
  height?: number;
  iterations?: number;
  nodeRadius?: number;
  linkDistance?: number;
  chargeStrength?: number;
  clusterStrength?: number;
}

const DEFAULTS: Required<LayoutOptions> = {
  width: 1200,
  height: 800,
  iterations: 100,
  nodeRadius: 62,
  linkDistance: 240,
  chargeStrength: -350,
  clusterStrength: 0.3,
};

function compactGridPositions(
  nodeIds: string[],
  spacing: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodeIds.length === 0) return positions;

  const cols = Math.ceil(Math.sqrt(nodeIds.length));
  const rows = Math.ceil(nodeIds.length / cols);
  const xOffset = ((cols - 1) * spacing) / 2;
  const yOffset = ((rows - 1) * spacing) / 2;

  for (let i = 0; i < nodeIds.length; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    positions.set(nodeIds[i], {
      x: col * spacing - xOffset,
      y: row * spacing - yOffset,
    });
  }

  return positions;
}

/**
 * Compute a full force-directed layout for the given nodes and edges.
 * Returns a Map of nodeId -> { x, y } positions.
 */
export function computeLayout(
  nodes: Map<string, PaperNode> | PaperNode[],
  edges: GraphEdge[],
  clusters?: Cluster[],
  options?: LayoutOptions
): Map<string, { x: number; y: number }> {
  const opts = { ...DEFAULTS, ...options };
  const nodeArray =
    nodes instanceof Map ? Array.from(nodes.values()) : nodes;

  if (nodeArray.length === 0) return new Map();

  const nodeSet = new Set(nodeArray.map((n) => n.id));

  // Create layout nodes with initial positions
  const layoutNodes: LayoutNode[] = nodeArray.map((n) => {
    const hasPosition = n.position.x !== 0 || n.position.y !== 0;
    return {
      id: n.id,
      x: hasPosition ? n.position.x : (Math.random() - 0.5) * opts.width,
      y: hasPosition ? n.position.y : (Math.random() - 0.5) * opts.height,
    };
  });

  // Create layout links, filtering to nodes that exist
  const layoutLinks: LayoutLink[] = edges
    .filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));

  // Build per-node collision radii from actual dimensions
  const nodeSizeMap = new Map<string, number>();
  for (const n of nodeArray) {
    const dims = getNodeDimensions(n.data.citationCount, n.scores.relevance);
    nodeSizeMap.set(n.id, Math.max(dims.width, dims.height) / 2);
  }

  // No topology information: use deterministic compact placement instead of
  // random force spread so new graphs look organized.
  if (layoutLinks.length === 0) {
    return compactGridPositions(
      nodeArray.map((n) => n.id),
      opts.nodeRadius * 3.2
    );
  }

  const simulation = forceSimulation<LayoutNode>(layoutNodes)
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(layoutLinks)
        .id((d) => d.id)
        .distance(opts.linkDistance)
        .strength((link) => link.weight * 0.5)
    )
    .force("charge", forceManyBody<LayoutNode>().strength(opts.chargeStrength))
    .force("center", forceCenter(0, 0))
    .force("x", forceX(0).strength(0.05))
    .force("y", forceY(0).strength(0.05))
    .force("collide", forceCollide<LayoutNode>((d) => {
      return (nodeSizeMap.get(d.id) ?? opts.nodeRadius) * 1.2;
    }).iterations(2));

  // Add cluster force if clusters are provided
  if (clusters && clusters.length > 0) {
    const clusterCentroids = computeClusterCentroids(layoutNodes, clusters);
    simulation.force(
      "cluster",
      clusterForce(clusters, clusterCentroids, opts.clusterStrength)
    );
  }

  // Run simulation synchronously
  simulation.stop();
  for (let i = 0; i < opts.iterations; i++) {
    simulation.tick();
  }

  // Extract positions
  const positions = new Map<string, { x: number; y: number }>();
  for (const node of layoutNodes) {
    positions.set(node.id, { x: node.x, y: node.y });
  }

  return positions;
}

/**
 * Incremental layout: add new nodes without disrupting existing positions.
 * Existing nodes are pinned (fx/fy), new nodes find their place.
 */
export function incrementalLayout(
  existingPositions: Map<string, { x: number; y: number }>,
  newNodes: PaperNode[],
  allNodes: Map<string, PaperNode> | PaperNode[],
  edges: GraphEdge[],
  clusters?: Cluster[],
  options?: LayoutOptions
): Map<string, { x: number; y: number }> {
  const opts = { ...DEFAULTS, ...options, iterations: 60 };
  const allNodeArray =
    allNodes instanceof Map ? Array.from(allNodes.values()) : allNodes;

  if (allNodeArray.length === 0) return new Map();

  const newNodeIds = new Set(newNodes.map((n) => n.id));
  const nodeSet = new Set(allNodeArray.map((n) => n.id));

  // Place new nodes near their connected existing neighbors
  const newPositions = new Map<string, { x: number; y: number }>();
  const existingPoints = Array.from(existingPositions.values());
  const existingCenter =
    existingPoints.length > 0
      ? {
          x: existingPoints.reduce((sum, p) => sum + p.x, 0) / existingPoints.length,
          y: existingPoints.reduce((sum, p) => sum + p.y, 0) / existingPoints.length,
        }
      : { x: 0, y: 0 };
  for (const node of newNodes) {
    const connectedEdges = edges.filter(
      (e) =>
        (e.source === node.id && existingPositions.has(e.target)) ||
        (e.target === node.id && existingPositions.has(e.source))
    );

    if (connectedEdges.length > 0) {
      // Average position of connected existing nodes + jitter
      let avgX = 0;
      let avgY = 0;
      for (const edge of connectedEdges) {
        const neighborId =
          edge.source === node.id ? edge.target : edge.source;
        const pos = existingPositions.get(neighborId)!;
        avgX += pos.x;
        avgY += pos.y;
      }
      avgX /= connectedEdges.length;
      avgY /= connectedEdges.length;
      newPositions.set(node.id, {
        x: avgX + (Math.random() - 0.5) * 56,
        y: avgY + (Math.random() - 0.5) * 56,
      });
    } else {
      // Place unconnected nodes near the current graph center, not at far periphery.
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.max(opts.nodeRadius * 3.5, 120) + Math.random() * 50;
      newPositions.set(node.id, {
        x: existingCenter.x + Math.cos(angle) * radius,
        y: existingCenter.y + Math.sin(angle) * radius,
      });
    }
  }

  // Build per-node collision radii from actual dimensions
  const nodeSizeMap = new Map<string, number>();
  for (const n of allNodeArray) {
    const dims = getNodeDimensions(n.data.citationCount, n.scores.relevance);
    nodeSizeMap.set(n.id, Math.max(dims.width, dims.height) / 2);
  }

  // Build layout nodes
  const layoutNodes: LayoutNode[] = allNodeArray.map((n) => {
    const isExisting = existingPositions.has(n.id) && !newNodeIds.has(n.id);
    const pos =
      existingPositions.get(n.id) ||
      newPositions.get(n.id) || { x: 0, y: 0 };
    return {
      id: n.id,
      x: pos.x,
      y: pos.y,
      // Pin existing nodes
      ...(isExisting ? { fx: pos.x, fy: pos.y } : {}),
    };
  });

  const layoutLinks: LayoutLink[] = edges
    .filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));

  const simulation = forceSimulation<LayoutNode>(layoutNodes)
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(layoutLinks)
        .id((d) => d.id)
        .distance(opts.linkDistance)
        .strength((link) => link.weight * 0.5)
    )
    .force("charge", forceManyBody<LayoutNode>().strength(opts.chargeStrength))
    .force("x", forceX(0).strength(0.05))
    .force("y", forceY(0).strength(0.05))
    .force("collide", forceCollide<LayoutNode>((d) => {
      return (nodeSizeMap.get(d.id) ?? opts.nodeRadius) * 1.2;
    }).iterations(2));

  if (clusters && clusters.length > 0) {
    const clusterCentroids = computeClusterCentroids(layoutNodes, clusters);
    simulation.force(
      "cluster",
      clusterForce(clusters, clusterCentroids, opts.clusterStrength)
    );
  }

  simulation.stop();
  for (let i = 0; i < opts.iterations; i++) {
    simulation.tick();
  }

  // Merge positions
  const result = new Map(existingPositions);
  for (const node of layoutNodes) {
    if (newNodeIds.has(node.id)) {
      result.set(node.id, { x: node.x, y: node.y });
    }
  }

  return result;
}

/**
 * Custom cluster force that pulls cluster members toward their centroid.
 */
export function clusterForce(
  clusters: Cluster[],
  centroids: Map<string, { x: number; y: number }>,
  strength: number
) {
  const clusterMap = new Map<string, string>();
  for (const cluster of clusters) {
    for (const nodeId of cluster.nodeIds) {
      clusterMap.set(nodeId, cluster.id);
    }
  }

  let nodes: LayoutNode[] = [];

  function force(alpha: number) {
    for (const node of nodes) {
      const clusterId = clusterMap.get(node.id);
      if (!clusterId) continue;
      const centroid = centroids.get(clusterId);
      if (!centroid) continue;

      const k = alpha * strength;
      node.vx = (node.vx || 0) + (centroid.x - node.x) * k;
      node.vy = (node.vy || 0) + (centroid.y - node.y) * k;
    }
  }

  force.initialize = (simNodes: LayoutNode[]) => {
    nodes = simNodes;
  };

  return force;
}

function computeClusterCentroids(
  nodes: LayoutNode[],
  clusters: Cluster[]
): Map<string, { x: number; y: number }> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const centroids = new Map<string, { x: number; y: number }>();

  for (const cluster of clusters) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const id of cluster.nodeIds) {
      const node = nodeMap.get(id);
      if (node) {
        sumX += node.x;
        sumY += node.y;
        count++;
      }
    }
    if (count > 0) {
      centroids.set(cluster.id, { x: sumX / count, y: sumY / count });
    }
  }

  return centroids;
}

/**
 * Create a layout runner that works with requestAnimationFrame.
 * Returns controls to start, stop, and get current positions.
 */
export function createAnimatedLayout(
  nodes: Map<string, PaperNode>,
  edges: GraphEdge[],
  clusters: Cluster[] | undefined,
  onTick: (positions: Map<string, { x: number; y: number }>) => void,
  options?: LayoutOptions
) {
  const opts = { ...DEFAULTS, ...options };
  const nodeArray = Array.from(nodes.values());
  const nodeSet = new Set(nodeArray.map((n) => n.id));

  // Build per-node collision radii from actual dimensions
  const nodeSizeMap = new Map<string, number>();
  for (const n of nodeArray) {
    const dims = getNodeDimensions(n.data.citationCount, n.scores.relevance);
    nodeSizeMap.set(n.id, Math.max(dims.width, dims.height) / 2);
  }

  const layoutNodes: LayoutNode[] = nodeArray.map((n) => {
    const hasPosition = n.position.x !== 0 || n.position.y !== 0;
    return {
      id: n.id,
      x: hasPosition ? n.position.x : (Math.random() - 0.5) * opts.width,
      y: hasPosition ? n.position.y : (Math.random() - 0.5) * opts.height,
    };
  });

  const layoutLinks: LayoutLink[] = edges
    .filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));

  const simulation = forceSimulation<LayoutNode>(layoutNodes)
    .force(
      "link",
      forceLink<LayoutNode, LayoutLink>(layoutLinks)
        .id((d) => d.id)
        .distance(opts.linkDistance)
        .strength((link) => link.weight * 0.5)
    )
    .force("charge", forceManyBody<LayoutNode>().strength(opts.chargeStrength))
    .force("center", forceCenter(0, 0))
    .force("x", forceX(0).strength(0.05))
    .force("y", forceY(0).strength(0.05))
    .force("collide", forceCollide<LayoutNode>((d) => {
      return (nodeSizeMap.get(d.id) ?? opts.nodeRadius) * 1.2;
    }).iterations(2));

  if (clusters && clusters.length > 0) {
    const clusterCentroids = computeClusterCentroids(layoutNodes, clusters);
    simulation.force(
      "cluster",
      clusterForce(clusters, clusterCentroids, opts.clusterStrength)
    );
  }

  let rafId: number | null = null;

  simulation.on("tick", () => {
    const positions = new Map<string, { x: number; y: number }>();
    for (const node of layoutNodes) {
      positions.set(node.id, { x: node.x, y: node.y });
    }
    onTick(positions);
  });

  return {
    start() {
      simulation.alpha(1).restart();
    },
    stop() {
      simulation.stop();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    },
    reheat() {
      simulation.alpha(0.3).restart();
    },
    getPositions(): Map<string, { x: number; y: number }> {
      const positions = new Map<string, { x: number; y: number }>();
      for (const node of layoutNodes) {
        positions.set(node.id, { x: node.x, y: node.y });
      }
      return positions;
    },
  };
}
