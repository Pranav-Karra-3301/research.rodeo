/**
 * Map recency score (0=old, 1=recent) to a color.
 * Old nodes are light blue-gray, recent nodes are deep indigo.
 */
export function getRecencyColor(recencyScore: number): string {
  const clamped = Math.max(0, Math.min(1, recencyScore));
  // HSL: hue=220, sat 30→65%, lightness 88→30%
  const sat = 30 + clamped * 35;
  const light = 88 - clamped * 58;
  return `hsl(220, ${sat}%, ${light}%)`;
}

export function getRecencyColorScale(): { offset: number; color: string }[] {
  return [
    { offset: 0, color: getRecencyColor(0) },
    { offset: 0.25, color: getRecencyColor(0.25) },
    { offset: 0.5, color: getRecencyColor(0.5) },
    { offset: 0.75, color: getRecencyColor(0.75) },
    { offset: 1, color: getRecencyColor(1) },
  ];
}
