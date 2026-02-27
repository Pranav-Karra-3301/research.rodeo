// ============================================================
// Rabbit Hole - Core Type Definitions
// ============================================================

// --- Paper & Node Types ---

export interface ExternalIds {
  doi?: string;
  arxivId?: string;
  semanticScholarId?: string;
  corpusId?: string;
  openAlexId?: string;
  pubmedId?: string;
}

export interface Author {
  id: string;
  name: string;
  affiliations?: string[];
  url?: string;
}

export interface PaperMetadata {
  id: string;
  externalIds: ExternalIds;
  title: string;
  authors: Author[];
  year?: number;
  abstract?: string;
  tldr?: string;
  venue?: string;
  citationCount: number;
  referenceCount: number;
  influentialCitationCount?: number;
  fieldsOfStudy?: string[];
  publicationTypes?: string[];
  openAccessPdf?: string;
  url?: string;
  embedding?: number[];
  ogImage?: string;
  faviconUrl?: string;
  siteDescription?: string;
  siteName?: string;
  isUrlSource?: boolean;
  fetchedContent?: string;
  contentTruncated?: boolean;
}

export type NodeState = "discovered" | "enriched" | "materialized" | "archived";

export interface PaperNode {
  id: string;
  data: PaperMetadata;
  state: NodeState;
  position: { x: number; y: number };
  clusterId?: string;
  scores: NodeScores;
  addedAt: number;
  expandedAt?: number;
  userNotes?: string;
  userTags?: string[];
}

export interface NodeScores {
  relevance: number;
  influence: number;
  recency: number;
  semanticSimilarity: number;
  localCentrality: number;
  velocity: number;
}

// --- Edge Types ---

export type EdgeType =
  | "cites"
  | "cited-by"
  | "semantic-similarity"
  | "same-author"
  | "same-dataset"
  | "methodologically-similar"
  | "contradicts"
  | "extends"
  | "same-venue";

export type EdgeTrust = "source-backed" | "inferred";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  trust: EdgeTrust;
  weight: number;
  evidence?: string;
  metadata?: Record<string, unknown>;
}

// --- Cluster Types ---

export interface Cluster {
  id: string;
  label: string;
  description?: string;
  nodeIds: string[];
  color: string;
  centroid?: number[];
}

// --- Scoring & Weights ---

export interface WeightConfig {
  influence: number;
  recency: number;
  semanticSimilarity: number;
  localCentrality: number;
  velocity: number;
}

export const DEFAULT_WEIGHTS: WeightConfig = {
  influence: 0.2,
  recency: 0.2,
  semanticSimilarity: 0.3,
  localCentrality: 0.2,
  velocity: 0.1,
};

export type WeightPreset = "foundational" | "cutting-edge" | "balanced";

export const WEIGHT_PRESETS: Record<WeightPreset, WeightConfig> = {
  foundational: {
    influence: 0.4,
    recency: 0.05,
    semanticSimilarity: 0.2,
    localCentrality: 0.3,
    velocity: 0.05,
  },
  "cutting-edge": {
    influence: 0.1,
    recency: 0.35,
    semanticSimilarity: 0.2,
    localCentrality: 0.05,
    velocity: 0.3,
  },
  balanced: {
    influence: 0.2,
    recency: 0.2,
    semanticSimilarity: 0.3,
    localCentrality: 0.2,
    velocity: 0.1,
  },
};

// --- Expansion Types ---

export type ExpansionMode = "foundational" | "recent" | "contrasting";

export interface FrontierRequest {
  nodeId: string;
  mode: ExpansionMode;
  budget?: number;
}

export interface FrontierResult {
  papers: PaperMetadata[];
  edges: GraphEdge[];
  mode: ExpansionMode;
  sourceNodeId: string;
}

// --- Search Types ---

export interface SearchQuery {
  text: string;
  filters?: {
    yearMin?: number;
    yearMax?: number;
    fieldsOfStudy?: string[];
    minCitations?: number;
    openAccessOnly?: boolean;
  };
}

export interface SearchResult {
  papers: PaperMetadata[];
  query: string;
  source: "exa" | "semantic-scholar" | "openalex";
}

// --- Annotation Types (New for Rabbit Hole) ---

export type AnnotationType = "insight" | "dead-end" | "key-find" | "question" | "summary";

export interface AnnotationNode {
  id: string;
  type: AnnotationType;
  content: string;
  position: { x: number; y: number };
  attachedToNodeId?: string;
  clusterId?: string;
  createdAt: number;
}

export type AnnotationNodeData = {
  annotation: AnnotationNode;
  isSelected?: boolean;
  onEdit?: (content: string) => void;
  onDelete?: () => void;
};

// --- Command Types ---

export type GraphCommandIntent =
  | {
      type: "add-node";
      paper: PaperMetadata;
      materialize?: boolean;
      source?: "chat" | "canvas" | "system";
    }
  | {
      type: "connect-nodes";
      sourceId: string;
      targetId: string;
      edgeType: EdgeType;
      trust?: EdgeTrust;
      weight?: number;
      evidence?: string;
      source?: "chat" | "canvas" | "system";
    }
  | {
      type: "expand-node";
      nodeId: string;
      mode: ExpansionMode;
      budget?: number;
      source?: "chat" | "canvas" | "system";
    }
  | {
      type: "archive-node";
      nodeId: string;
      source?: "chat" | "canvas" | "system";
    }
  | {
      type: "relayout";
      source?: "chat" | "canvas" | "system";
    };

export interface GraphCommandResult {
  applied: boolean;
  summary: string;
  error?: string;
  addedNodeIds?: string[];
  addedEdgeIds?: string[];
}

// --- API Response Types ---

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  status: "success" | "error";
}

// --- React Flow Integration Types ---

export type GraphNodeData = {
  paper: PaperMetadata;
  state: NodeState;
  scores: NodeScores;
  clusterId?: string;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  isExpanding?: boolean;
  isFrontier?: boolean;
  recencyColor?: string;
  dimensions?: { width: number; height: number; fontScale: number };
  fadeOpacity?: number;
  onExpand?: (mode: ExpansionMode) => void;
  onSelect?: () => void;
  onMaterialize?: () => void;
  [key: string]: unknown;
};
