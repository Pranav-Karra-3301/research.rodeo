"use client";
import { memo } from "react";
import { useStore } from "@xyflow/react";
import type { Cluster, PaperNode } from "@/types";

interface ClusterHullProps {
  cluster: Cluster;
  nodes: Map<string, PaperNode>;
}

function ClusterHullInner({ cluster, nodes }: ClusterHullProps) {
  // Get transform from React Flow viewport
  const transform = useStore((s) => s.transform);

  // Get positions of cluster member nodes
  const positions = cluster.nodeIds
    .map(id => nodes.get(id))
    .filter((n): n is PaperNode => n != null)
    .map(n => ({
      x: n.position.x * transform[2] + transform[0],
      y: n.position.y * transform[2] + transform[1],
    }));

  if (positions.length < 3) return null;

  // Compute convex hull
  const hull = convexHull(positions);
  // Add padding
  const padded = expandHull(hull, 40 * transform[2]);
  const pathD = padded.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Centroid for label
  const cx = padded.reduce((s, p) => s + p.x, 0) / padded.length;
  const cy = padded.reduce((s, p) => s + p.y, 0) / padded.length;

  return (
    <g>
      <path d={pathD} fill={cluster.color} fillOpacity={0.08} stroke={cluster.color} strokeOpacity={0.2} strokeWidth={1} />
      <text x={cx} y={cy} textAnchor="middle" fill={cluster.color} fontSize={12 * transform[2]} opacity={0.5}>
        {cluster.label}
      </text>
    </g>
  );
}

function convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
  // Gift wrapping algorithm (Andrew's monotone chain)
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 2) return sorted;
  const lower: typeof sorted = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: typeof sorted = [];
  for (const p of sorted.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function cross(o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function expandHull(hull: { x: number; y: number }[], padding: number) {
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map(p => {
    const dx = p.x - cx, dy = p.y - cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: p.x + (dx / len) * padding, y: p.y + (dy / len) * padding };
  });
}

export const ClusterHull = memo(ClusterHullInner);
