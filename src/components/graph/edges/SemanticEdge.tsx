"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { EDGE_STYLES } from "@/lib/design-tokens";

export function SemanticEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  selected,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const style = EDGE_STYLES["semantic-similarity"];

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        strokeDasharray: style.dashArray,
        opacity: selected ? 0.8 : 0.5,
        transition: "opacity 0.2s",
      }}
    />
  );
}
