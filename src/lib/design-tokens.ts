// ============================================================
// Rabbit Hole - Design Tokens
// ============================================================

export const colors = {
  bg: {
    base: "#f8f7f4",
    surface: "#ffffff",
    elevated: "#f3f2ee",
    hover: "#eeeee8",
    active: "#e8e7e2",
  },
  border: {
    subtle: "#e8e7e2",
    default: "#dddcd7",
    strong: "#c8c7c2",
  },
  text: {
    primary: "#1c1917",
    secondary: "#57534e",
    tertiary: "#78716c",
    muted: "#a8a29e",
  },
  accent: {
    default: "#7c3aed",
    hover: "#6d28d9",
    muted: "rgba(124, 58, 237, 0.08)",
    text: "#7c3aed",
  },
  success: "#22c55e",
  warning: "#eab308",
  error: "#ef4444",
  info: "#3b82f6",
} as const;

export const typography = {
  family: {
    sans: "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
    mono: "var(--font-geist-mono), 'Fira Code', monospace",
  },
  size: {
    xs: { fontSize: "0.75rem", lineHeight: "1rem" },
    sm: { fontSize: "0.8125rem", lineHeight: "1.25rem" },
    base: { fontSize: "0.875rem", lineHeight: "1.5rem" },
    lg: { fontSize: "1rem", lineHeight: "1.5rem" },
    xl: { fontSize: "1.125rem", lineHeight: "1.75rem" },
  },
} as const;

export const layout = {
  topBar: { height: 48 },
  borderRadius: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    full: "9999px",
  },
} as const;

export const animation = {
  fast: { duration: 0.15, ease: [0.4, 0, 0.2, 1] },
  normal: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  slow: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  spring: { type: "spring" as const, stiffness: 400, damping: 30 },
} as const;

export const CLUSTER_COLORS = [
  "#8b5cf6", "#3b82f6", "#22c55e", "#eab308", "#ef4444",
  "#f97316", "#06b6d4", "#ec4899", "#14b8a6", "#a855f7",
  "#6366f1", "#84cc16",
] as const;

export const EDGE_STYLES = {
  "cites": { stroke: "#a8a29e", strokeWidth: 1.5, dashArray: undefined },
  "cited-by": { stroke: "#a8a29e", strokeWidth: 1.5, dashArray: undefined },
  "semantic-similarity": { stroke: "#8b5cf6", strokeWidth: 1, dashArray: "6 3" },
  "same-author": { stroke: "#3b82f6", strokeWidth: 1, dashArray: "4 4" },
  "same-dataset": { stroke: "#22c55e", strokeWidth: 1, dashArray: "4 4" },
  "methodologically-similar": { stroke: "#eab308", strokeWidth: 1, dashArray: "6 3" },
  "contradicts": { stroke: "#ef4444", strokeWidth: 2, dashArray: "4 3" },
  "extends": { stroke: "#06b6d4", strokeWidth: 1.5, dashArray: undefined },
  "same-venue": { stroke: "#c8c7c2", strokeWidth: 1, dashArray: "2 4" },
} as const;

export const ANNOTATION_COLORS = {
  insight: { bg: "#FEF9C3", border: "#F59E0B", text: "#92400E" },
  "dead-end": { bg: "#FEE2E2", border: "#EF4444", text: "#991B1B" },
  "key-find": { bg: "#DCFCE7", border: "#22C55E", text: "#166534" },
  question: { bg: "#EDE9FE", border: "#8B5CF6", text: "#5B21B6" },
  summary: { bg: "#F8FAFC", border: "#64748B", text: "#1E293B" },
} as const;
