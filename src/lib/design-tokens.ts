// ============================================================
// Research Rodeo - Design Tokens
// Shared constants for consistent theming across all components
// ============================================================

// --- Color Palette ---
export const colors = {
  // Background layers (lightest to most elevated)
  bg: {
    base: "#f8f7f4",       // warm off-white - app background
    surface: "#ffffff",    // white - cards, panels
    elevated: "#f3f2ee",   // warm gray - dropdowns, popovers
    hover: "#eeeee8",      // hover states
    active: "#e8e7e2",     // active/pressed
  },
  // Borders
  border: {
    subtle: "#e8e7e2",
    default: "#dddcd7",
    strong: "#c8c7c2",
  },
  // Text
  text: {
    primary: "#1c1917",    // stone-900
    secondary: "#57534e",  // stone-600
    tertiary: "#78716c",   // stone-500
    muted: "#a8a29e",      // stone-400
  },
  // Accent (violet)
  accent: {
    default: "#7c3aed",    // violet-600
    hover: "#6d28d9",      // violet-700
    muted: "rgba(124, 58, 237, 0.08)",
    text: "#7c3aed",       // violet-600
  },
  // Semantic colors
  success: "#22c55e",
  warning: "#eab308",
  error: "#ef4444",
  info: "#3b82f6",
  // Paper type colors (warm, for cards - inspired by the library UI)
  paper: {
    green: "#dcfce7",
    blue: "#dbeafe",
    purple: "#ede9fe",
    amber: "#fef3c7",
    rose: "#ffe4e6",
    teal: "#ccfbf1",
  },
} as const;

// --- Typography Scale ---
export const typography = {
  // Font families (set via CSS variables from next/font)
  family: {
    sans: "var(--font-inter), system-ui, -apple-system, sans-serif",
    mono: "var(--font-jetbrains), 'JetBrains Mono', 'Fira Code', monospace",
    serif: "var(--font-source-serif), 'Source Serif 4', Georgia, serif",
  },
  // Font sizes with line heights
  size: {
    xs: { fontSize: "0.75rem", lineHeight: "1rem" },
    sm: { fontSize: "0.8125rem", lineHeight: "1.25rem" },
    base: { fontSize: "0.875rem", lineHeight: "1.5rem" },
    lg: { fontSize: "1rem", lineHeight: "1.5rem" },
    xl: { fontSize: "1.125rem", lineHeight: "1.75rem" },
    "2xl": { fontSize: "1.5rem", lineHeight: "2rem" },
    "3xl": { fontSize: "1.875rem", lineHeight: "2.25rem" },
  },
} as const;

// --- Spacing & Layout ---
export const layout = {
  topBar: { height: 48 },
  sidebar: { width: 280 },
  rightPanel: { width: 420 },
  borderRadius: {
    sm: "0.375rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    full: "9999px",
  },
} as const;

// --- Animation ---
export const animation = {
  fast: { duration: 0.15, ease: [0.4, 0, 0.2, 1] },
  normal: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
  slow: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
  spring: { type: "spring" as const, stiffness: 400, damping: 30 },
} as const;

// --- Keyboard Shortcuts ---
export const shortcuts = {
  search: { key: "k", meta: true, label: "Search" },
  chat: { key: "/", meta: true, label: "Chat" },
  export: { key: "e", meta: true, label: "Export" },
  close: { key: "Escape", meta: false, label: "Close" },
  delete: { key: "Backspace", meta: false, label: "Archive" },
  selectAll: { key: "a", meta: true, label: "Select all" },
  fitView: { key: "0", meta: true, label: "Fit view" },
} as const;

// --- Cluster color palette (deterministic) ---
export const CLUSTER_COLORS = [
  "#8b5cf6", // violet
  "#3b82f6", // blue
  "#22c55e", // green
  "#eab308", // yellow
  "#ef4444", // red
  "#f97316", // orange
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#14b8a6", // teal
  "#a855f7", // purple
  "#6366f1", // indigo
  "#84cc16", // lime
] as const;

// --- Edge styles by type ---
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
