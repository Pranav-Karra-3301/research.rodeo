"use client";

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import { EDGE_STYLES } from "@/lib/design-tokens";

export function ContradictionEdge({
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const style = EDGE_STYLES["contradicts"];
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: style.stroke,
          strokeWidth: style.strokeWidth,
          strokeDasharray: style.dashArray,
        }}
      />
      <g transform={`translate(${midX}, ${midY})`}>
        <circle r={7} fill="#f8f7f4" stroke={style.stroke} strokeWidth={1.5} />
        <line x1={-3} y1={-3} x2={3} y2={3} stroke={style.stroke} strokeWidth={1.5} />
        <line x1={3} y1={-3} x2={-3} y2={3} stroke={style.stroke} strokeWidth={1.5} />
      </g>
    </>
  );
}
