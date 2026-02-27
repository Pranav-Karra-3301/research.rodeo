export type ZoomLevel = "cluster" | "overview" | "medium" | "detail";

export const ZOOM_THRESHOLDS: Record<ZoomLevel, { min: number; max: number }> = {
  cluster:  { min: 0,   max: 0.3 },
  overview: { min: 0.3, max: 0.6 },
  medium:   { min: 0.6, max: 1.2 },
  detail:   { min: 1.2, max: Infinity },
};

export function getZoomLevel(zoom: number): ZoomLevel {
  if (zoom < 0.3) return "cluster";
  if (zoom < 0.6) return "overview";
  if (zoom < 1.2) return "medium";
  return "detail";
}
