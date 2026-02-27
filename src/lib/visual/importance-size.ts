export function getNodeDimensions(
  citationCount: number,
  relevanceScore: number
): { width: number; height: number; fontScale: number } {
  const logCitations = citationCount > 0 ? Math.log10(citationCount + 1) / 4 : 0;
  const t = Math.min(logCitations * 0.6 + relevanceScore * 0.4, 1);
  return {
    width: Math.round(180 + t * 140),
    height: Math.round(80 + t * 60),
    fontScale: 0.85 + t * 0.3,
  };
}

export function getFocusedNodeScale(): number {
  return 1.3;
}
