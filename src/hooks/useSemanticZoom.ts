"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@xyflow/react";
import { useUIStore } from "@/store/ui-store";
import { getZoomLevel, type ZoomLevel } from "@/lib/visual/zoom-levels";

export function useSemanticZoom(): { zoomLevel: ZoomLevel; rawZoom: number } {
  const rawZoom = useStore((s) => s.transform[2]);
  const zoomLevel = getZoomLevel(rawZoom);
  const prevLevel = useRef<ZoomLevel>(zoomLevel);

  useEffect(() => {
    if (prevLevel.current !== zoomLevel) {
      prevLevel.current = zoomLevel;
      useUIStore.getState().setCurrentZoomLevel(zoomLevel);
    }
  }, [zoomLevel]);

  return { zoomLevel, rawZoom };
}
