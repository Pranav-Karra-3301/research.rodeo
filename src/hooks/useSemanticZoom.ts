"use client";

import { useStore } from "@xyflow/react";
import { getZoomLevel, type ZoomLevel } from "@/lib/visual/zoom-levels";

export function useSemanticZoom(): { zoomLevel: ZoomLevel; rawZoom: number } {
  const rawZoom = useStore((s) => s.transform[2]);
  const zoomLevel = getZoomLevel(rawZoom);

  return { zoomLevel, rawZoom };
}
