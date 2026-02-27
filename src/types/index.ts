// ============================================================
// Research Rodeo - Core Type Definitions
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
  id: string; // Internal canonical ID
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
  // URL-sourced node extras
  ogImage?: string;
  faviconUrl?: string;
  siteDescription?: string;
  siteName?: string;
  isUrlSource?: boolean;
  // Pre-fetched content (filled in by the add-source pipeline)
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
  addedAt: number; // timestamp
  expandedAt?: number;
  userNotes?: string;
  userTags?: string[];
}

export interface NodeScores {
  relevance: number; // 0-1 composite score
  influence: number; // log(citations + 1) normalized
  recency: number; // age-weighted citation impact
  semanticSimilarity: number; // cosine sim to query
  localCentrality: number; // PageRank in local graph
  velocity: number; // citation momentum
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
  source: string; // node id
  target: string; // node id
  type: EdgeType;
  trust: EdgeTrust;
  weight: number; // 0-1
  evidence?: string; // explanation for inferred edges
  metadata?: Record<string, unknown>;
}

// --- Cluster Types ---

export interface Cluster {
  id: string;
  label: string;
  description?: string;
  nodeIds: string[];
  color: string;
  centroid?: number[]; // embedding centroid
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
  budget?: number; // max frontier nodes to return
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

// --- Annotation Types ---

export interface Annotation {
  id: string;
  paperId: string;
  text: string; // highlighted text
  note?: string;
  tags: string[];
  type?: "method" | "assumption" | "result" | "limitation" | "key-claim";
  createdAt: number;
}

// --- Rabbit Hole Workflow Types ---

export type RabbitHoleLayer = 0 | 1 | 2 | 3;

export type LayerStatus = "pending" | "active" | "completed";

export interface ScopeQuestion {
  id: string;
  question: string;
  rationale?: string;
}

export interface ScopeAnswer {
  questionId: string;
  answer: string;
}

export type EvidenceCardType = "source" | "contradiction" | "gap";

export type EvidenceCardStatus =
  | "new"
  | "added"
  | "contradiction"
  | "saved"
  | "dismissed";

export type EvidenceConfidence = "high" | "medium" | "low";

export interface EvidenceCitation {
  title?: string;
  url: string;
  snippet?: string;
}

export interface EvidenceCard {
  id: string;
  rabbitHoleId: string;
  layer: RabbitHoleLayer;
  type: EvidenceCardType;
  status: EvidenceCardStatus;
  title: string;
  url?: string;
  snippet?: string;
  confidence: EvidenceConfidence;
  citations: EvidenceCitation[];
  payload?: Record<string, unknown>;
  linkedNodeId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppliedChangeEvent {
  id: string;
  rabbitHoleId: string;
  source: "chat" | "canvas" | "system";
  actionType: string;
  summary: string;
  payload?: Record<string, unknown>;
  createdAt: number;
}

// --- Chat Threading Types ---

export interface ChatThread {
  id: string;
  rabbitHoleId: string;
  title?: string;
  createdAt: number;
  updatedAt: number;
  nextSeq: number;
}

export interface ChatMessageRecord {
  id: string;
  rabbitHoleId: string;
  threadId: string;
  seq: number;
  role: string;
  messageJson: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatReasoningState {
  mode: "compact" | "full" | "off";
  active: boolean;
  compacted: boolean;
}

export type GraphCommandIntent =
  | {
      type: "add-node";
      paper: PaperMetadata;
      materialize?: boolean;
      source?: "chat" | "canvas" | "system";
      evidenceCardId?: string;
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
      type: "merge-clusters";
      clusterIdA: string;
      clusterIdB: string;
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
    }
  | {
      type: "add-contradiction";
      anchorNodeId?: string;
      paper?: PaperMetadata;
      title?: string;
      url?: string;
      snippet?: string;
      source?: "chat" | "canvas" | "system";
      evidenceCardId?: string;
    }
  | {
      type: "save-for-later";
      evidenceCardId: string;
      source?: "chat" | "canvas" | "system";
    };

export interface GraphCommandResult {
  applied: boolean;
  summary: string;
  error?: string;
  addedNodeIds?: string[];
  addedEdgeIds?: string[];
}

// --- Chat Types ---

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  actions?: AgentAction[];
  timestamp: number;
}

export interface Citation {
  paperId: string;
  title: string;
  snippet?: string;
  relevance?: string;
}

export interface AgentAction {
  type: "expand" | "highlight" | "add-edge" | "filter" | "navigate" | "export";
  payload: Record<string, unknown>;
  description: string;
}

// --- Project Types ---

export interface Project {
  id: string;
  name: string;
  rootQuery: string;
  createdAt: number;
  updatedAt: number;
  weights: WeightConfig;
  nodes: PaperNode[];
  edges: GraphEdge[];
  clusters: Cluster[];
  annotations: Annotation[];
  chatHistory: ChatMessage[];
}

// --- Export Types ---

export type ExportFormat = "bibtex" | "ris" | "json" | "markdown" | "obsidian";

export interface ExportRequest {
  format: ExportFormat;
  nodeIds?: string[]; // if empty, export all
  includeReview?: boolean; // generate lit review draft
  clusterId?: string;
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
  onExpand?: (mode: ExpansionMode) => void;
  onSelect?: () => void;
  onMaterialize?: () => void;
  recencyColor?: string;
  dimensions?: { width: number; height: number; fontScale: number };
  fadeOpacity?: number;
  [key: string]: unknown;
}

/* ── Annotation types (new for rabbits branch) ─────────────────── */

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
