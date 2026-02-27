"use client";
import type { ZoomLevel } from "@/lib/visual/zoom-levels";
import type { ReactNode } from "react";

interface Props {
  show: ZoomLevel[];
  currentZoom: ZoomLevel;
  children: ReactNode;
}

export function ZoomLevelRenderer({ show, currentZoom, children }: Props) {
  if (!show.includes(currentZoom)) return null;
  return <>{children}</>;
}
