import type { PaperNode, Cluster, WeightConfig, AnnotationNode } from "@/types";
import { sanitizeAbstractText } from "@/lib/utils";

/**
 * Build a concise project brief for the system prompt.
 */
export function buildProjectBrief(
  rootQuery: string,
  weights: WeightConfig,
  nodeCount: number,
  clusterCount: number
): string {
  const presetLabel =
    weights.recency > 0.3
      ? "cutting-edge"
      : weights.influence > 0.3
        ? "foundational"
        : "balanced";

  return [
    `## Research Project Context`,
    `**Root Query:** "${rootQuery}"`,
    `**Exploration Preference:** ${presetLabel}`,
    `**Graph Size:** ${nodeCount} sources across ${clusterCount} clusters`,
    `**Weight Profile:** influence=${weights.influence}, recency=${weights.recency}, similarity=${weights.semanticSimilarity}, centrality=${weights.localCentrality}, velocity=${weights.velocity}`,
  ].join("\n");
}

/**
 * Summarize clusters as brief descriptions for context.
 */
export function buildClusterBriefs(
  clusters: Cluster[],
  nodes: PaperNode[]
): string {
  if (clusters.length === 0) return "";

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  const briefs = clusters.slice(0, 10).map((cluster) => {
    const clusterNodes = cluster.nodeIds
      .map((id) => nodeMap.get(id))
      .filter((n): n is PaperNode => n !== undefined);

    const topPapers = clusterNodes
      .sort((a, b) => b.scores.relevance - a.scores.relevance)
      .slice(0, 3);

    const paperList = topPapers
      .map((n) => `  - [${n.data.title}, ${n.data.year ?? "n.d."}]`)
      .join("\n");

    const avgYear =
      clusterNodes.length > 0
        ? Math.round(
            clusterNodes.reduce((s, n) => s + (n.data.year ?? 2020), 0) /
              clusterNodes.length
          )
        : "unknown";

    return `### ${cluster.label} (${cluster.nodeIds.length} papers, avg year ~${avgYear})\n${cluster.description ?? ""}\nTop papers:\n${paperList}`;
  });

  return `## Cluster Overview\n${briefs.join("\n\n")}`;
}

/**
 * Retrieve the most relevant papers as digests for context injection.
 * Uses a simple keyword overlap score since we don't have embeddings client-side.
 */
export function retrieveRelevantPapers(
  question: string,
  nodes: PaperNode[],
  topK: number = 15
): string {
  if (nodes.length === 0) return "";

  const queryTerms = new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );

  // Score each node by keyword overlap + relevance score
  const scored = nodes.map((node) => {
    const titleTerms = node.data.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/);
    const abstractTerms = sanitizeAbstractText(node.data.abstract ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/);

    let keywordScore = 0;
    for (const term of queryTerms) {
      if (titleTerms.includes(term)) keywordScore += 2;
      if (abstractTerms.includes(term)) keywordScore += 1;
    }

    const combinedScore = keywordScore * 0.4 + node.scores.relevance * 0.6;
    return { node, score: combinedScore };
  });

  const top = scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.node);

  const digests = top.map((n) => {
    if (n.data.isUrlSource) {
      const desc = n.data.siteDescription ?? n.data.abstract;
      const site = n.data.siteName ?? (() => {
        try { return new URL(n.data.url ?? "").hostname.replace(/^www\./, ""); } catch { return ""; }
      })();
      const lines = [
        `**[${n.data.title}]** (ID: ${n.id}) — ${site}`,
        `URL: ${n.data.url ?? "N/A"}`,
      ];
      if (desc) lines.push(desc.slice(0, 200) + (desc.length > 200 ? "..." : ""));
      return lines.join("\n");
    }

    const authors =
      n.data.authors.length > 0
        ? n.data.authors
            .slice(0, 3)
            .map((a) => a.name)
            .join(", ") + (n.data.authors.length > 3 ? " et al." : "")
        : "Unknown authors";
    const cleanAbstract = n.data.abstract
      ? sanitizeAbstractText(n.data.abstract)
      : "";
    const abstract = cleanAbstract
      ? cleanAbstract.slice(0, 200) + (cleanAbstract.length > 200 ? "..." : "")
      : "No abstract available";
    return `**[${n.data.title}, ${n.data.year ?? "n.d."}]** (ID: ${n.id})\nAuthors: ${authors} | Citations: ${n.data.citationCount} | Venue: ${n.data.venue ?? "Unknown"}\n${abstract}`;
  });

  return `## Sources in Graph\n${digests.join("\n\n")}`;
}

/**
 * Build context for user annotations (insights, key findings, dead ends, etc.)
 */
export function buildAnnotationContext(
  annotations: AnnotationNode[],
  nodes: PaperNode[]
): string {
  if (annotations.length === 0) return "";
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const lines = annotations.map((a) => {
    const node = a.attachedToNodeId ? nodeMap.get(a.attachedToNodeId) : undefined;
    const label = node ? node.data.title : (a.clusterId ?? "general");
    return `- [${a.type}] on "${label}": ${a.content}`;
  });
  return `## User Annotations\n${lines.join("\n")}`;
}

/**
 * Assemble a multi-tier context for the chat system prompt.
 * Returns an array of context strings: [brief, clusters, papers, annotations]
 */
export function assembleContext(
  project: {
    rootQuery: string;
    weights: WeightConfig;
    nodes: PaperNode[];
    clusters: Cluster[];
    annotations?: AnnotationNode[];
  },
  question: string
): string[] {
  const brief = buildProjectBrief(
    project.rootQuery,
    project.weights,
    project.nodes.length,
    project.clusters.length
  );

  const clusterBriefs = buildClusterBriefs(project.clusters, project.nodes);

  const papers = retrieveRelevantPapers(question, project.nodes);

  const annotationCtx = buildAnnotationContext(
    project.annotations ?? [],
    project.nodes
  );

  return [brief, clusterBriefs, papers, annotationCtx].filter(
    (s) => s.length > 0
  );
}
