"use client";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function AnnotationEdge({
  sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
}: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <BaseEdge path={edgePath} style={{ stroke: "#94a3b8", strokeWidth: 1, strokeDasharray: "4 4", opacity: 0.4 }} />
  );
}
