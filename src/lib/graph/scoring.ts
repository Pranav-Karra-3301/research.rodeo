import type { PaperNode, NodeScores, WeightConfig } from "@/types";

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Influence score from citation count.
 * Uses log scale so highly-cited papers don't completely dominate.
 */
export function computeInfluence(citationCount: number): number {
  return Math.log(citationCount + 1);
}

/**
 * Recency score: newer papers with citations score higher.
 * Papers with no year get a middle-ground score.
 */
export function computeRecency(
  year: number | undefined,
  citationCount: number
): number {
  if (!year) return 0.5;
  const age = Math.max(CURRENT_YEAR - year, 0);
  // Exponential decay on age, boosted by having some citations
  const freshness = Math.exp(-age / 10);
  const citationBoost = Math.log(citationCount + 1) / 10;
  return freshness + citationBoost;
}

/**
 * Cosine similarity between two embeddings.
 */
export function computeSemanticSimilarity(
  embedding1: number[],
  embedding2: number[]
): number {
  if (embedding1.length !== embedding2.length || embedding1.length === 0) {
    return 0;
  }
  let dot = 0;
  let mag1 = 0;
  let mag2 = 0;
  for (let i = 0; i < embedding1.length; i++) {
    dot += embedding1[i] * embedding2[i];
    mag1 += embedding1[i] * embedding1[i];
    mag2 += embedding2[i] * embedding2[i];
  }
  const denom = Math.sqrt(mag1) * Math.sqrt(mag2);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * Velocity: rough citations per year since publication.
 */
export function computeVelocity(
  citationCount: number,
  year: number | undefined
): number {
  if (!year || citationCount === 0) return 0;
  const age = Math.max(CURRENT_YEAR - year, 1);
  return citationCount / age;
}

/**
 * Compute the weighted composite relevance score for a node.
 */
export function computeNodeScore(
  node: PaperNode,
  weights: WeightConfig,
  queryEmbedding?: number[]
): number {
  const scores = node.scores;
  let semSim = scores.semanticSimilarity;

  // Recompute semantic similarity if we have a query embedding and node embedding
  if (queryEmbedding && node.data.embedding) {
    semSim = computeSemanticSimilarity(node.data.embedding, queryEmbedding);
  }

  return (
    weights.influence * scores.influence +
    weights.recency * scores.recency +
    weights.semanticSimilarity * semSim +
    weights.localCentrality * scores.localCentrality +
    weights.velocity * scores.velocity
  );
}

/**
 * Min-max normalize all score dimensions across a set of nodes.
 * Mutates node scores in place for performance, returns the same array.
 */
export function normalizeScores(nodes: PaperNode[]): PaperNode[] {
  if (nodes.length === 0) return nodes;

  const dimensions: (keyof Omit<NodeScores, "relevance">)[] = [
    "influence",
    "recency",
    "semanticSimilarity",
    "localCentrality",
    "velocity",
  ];

  for (const dim of dimensions) {
    let min = Infinity;
    let max = -Infinity;
    for (const node of nodes) {
      const val = node.scores[dim];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    const range = max - min;
    for (const node of nodes) {
      node.scores[dim] = range === 0 ? 0.5 : (node.scores[dim] - min) / range;
    }
  }

  return nodes;
}

/**
 * Returns a labeled breakdown of scores for tooltip display.
 */
export function getScoreBreakdown(
  node: PaperNode,
  weights: WeightConfig
): { label: string; raw: number; weighted: number }[] {
  return [
    {
      label: "Influence",
      raw: node.scores.influence,
      weighted: node.scores.influence * weights.influence,
    },
    {
      label: "Recency",
      raw: node.scores.recency,
      weighted: node.scores.recency * weights.recency,
    },
    {
      label: "Semantic Similarity",
      raw: node.scores.semanticSimilarity,
      weighted: node.scores.semanticSimilarity * weights.semanticSimilarity,
    },
    {
      label: "Local Centrality",
      raw: node.scores.localCentrality,
      weighted: node.scores.localCentrality * weights.localCentrality,
    },
    {
      label: "Velocity",
      raw: node.scores.velocity,
      weighted: node.scores.velocity * weights.velocity,
    },
  ];
}

/**
 * Compute raw (un-normalized) scores for a paper node from its metadata.
 * Useful when adding new nodes to the graph.
 */
export function computeRawScores(
  node: PaperNode,
  queryEmbedding?: number[]
): NodeScores {
  const { data } = node;
  const influence = computeInfluence(data.citationCount);
  const recency = computeRecency(data.year, data.citationCount);
  const velocity = computeVelocity(data.citationCount, data.year);
  const semanticSimilarity =
    queryEmbedding && data.embedding
      ? computeSemanticSimilarity(data.embedding, queryEmbedding)
      : node.scores.semanticSimilarity;

  return {
    influence,
    recency,
    semanticSimilarity,
    localCentrality: node.scores.localCentrality, // computed externally via PageRank
    velocity,
    relevance: 0, // computed after normalization
  };
}
