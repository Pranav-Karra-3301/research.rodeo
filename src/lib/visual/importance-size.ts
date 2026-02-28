import type { AnnotationType } from "@/types";

/** Fixed dimensions for annotation/accessory nodes used in layout and collision detection. */
export function getAnnotationNodeDimensions(type?: AnnotationType): { width: number; height: number } {
  if (type === "summary") return { width: 300, height: 110 };
  // insight, key-find, dead-end, question all use 180px wide cards
  return { width: 180, height: 100 };
}

export function getNodeDimensions(
  citationCount: number,
  relevanceScore: number
): { width: number; height: number; fontScale: number } {
  // Relevance-dominant blend (relevance is already 0-1 normalized)
  const logCitations = citationCount > 0 ? Math.log10(citationCount + 1) / 4 : 0;
  const raw = Math.min(relevanceScore * 0.7 + logCitations * 0.3, 1);
  // Power curve: small nodes stay small, important ones grow noticeably
  const t = Math.pow(raw, 0.6);
  return {
    width:  Math.round(160 + t * 180),   // 160-340px (wider range)
    height: Math.round(70 + t * 80),     // 70-150px
    fontScale: 0.8 + t * 0.4,            // 0.8-1.2
  };
}

export function getFocusedNodeScale(): number {
  return 1.3;
}
