"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { EDGE_STYLES } from "@/lib/design-tokens";

export function CitationEdge({
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

  const style = EDGE_STYLES["cites"];

  return (
    <BaseEdge
      path={edgePath}
      markerEnd={markerEnd}
      style={{
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        opacity: selected ? 1 : 0.6,
        transition: "opacity 0.2s, stroke 0.2s",
      }}
    />
  );
}
