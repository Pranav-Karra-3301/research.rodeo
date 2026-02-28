import {
  streamText,
  tool,
  stepCountIs,
  convertToModelMessages,
  pruneMessages,
  type UIMessage,
} from "ai";
import { anthropic, type AnthropicProviderOptions } from "@ai-sdk/anthropic";
import { z } from "zod";
import { RESEARCH_AGENT_SYSTEM_PROMPT } from "@/lib/agents/prompts";
import {
  getPaperCitations,
  getPaperReferences,
} from "@/lib/api/semantic-scholar";
import { canonicalIdToS2Query } from "@/lib/api/paper-resolver";

const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CHAT_MODEL_ID = process.env.CHAT_MODEL ?? "claude-sonnet-4-6";
const CHAT_REASONING_MODE =
  process.env.CHAT_REASONING_MODE === "full" ||
  process.env.CHAT_REASONING_MODE === "off"
    ? process.env.CHAT_REASONING_MODE
    : "compact";
const CHAT_REASONING_BUDGET_TOKENS = Number(
  process.env.CHAT_REASONING_BUDGET_TOKENS ?? 1024
);
const CHAT_COMPACTION_TRIGGER_TOKENS = Number(
  process.env.CHAT_COMPACTION_TRIGGER_TOKENS ?? 120000
);

function buildSystemPrompt(projectContext?: string[]): string {
  const contextBlock =
    projectContext && Array.isArray(projectContext)
      ? projectContext.join("\n\n")
      : "";
  return [RESEARCH_AGENT_SYSTEM_PROMPT, contextBlock]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export async function POST(req: Request) {
  const body = await req.json();
  const { messages: rawMessages, projectContext } = body;
  const uiMessages: UIMessage[] = Array.isArray(rawMessages) ? rawMessages : [];

  const lastMsg = uiMessages[uiMessages.length - 1];
  const previewText = lastMsg?.parts?.find((p: { type: string }) => p.type === "text");
  console.log("[research-rodeo] [chat] message:", previewText && "text" in previewText ? String(previewText.text).slice(0, 80) : "(content)");

  // Convert UIMessages (from useChat) to ModelMessages (for streamText)
  const modelMessages = await convertToModelMessages(uiMessages);
  const prunedMessages = pruneMessages({
    messages: modelMessages,
    reasoning: "before-last-message",
    toolCalls: "before-last-6-messages",
    emptyMessages: "remove",
  });
  const systemPrompt = buildSystemPrompt(projectContext);

  // compact_20260112 is only supported on Sonnet 4.6+ and Opus 4.6+
  const supportsCompaction = /4[-.]6/.test(CHAT_MODEL_ID);

  const anthropicProviderOptions: AnthropicProviderOptions = {
    sendReasoning: CHAT_REASONING_MODE === "full",
    thinking:
      CHAT_REASONING_MODE === "off"
        ? { type: "disabled" as const }
        : {
            type: "enabled" as const,
            budgetTokens: CHAT_REASONING_BUDGET_TOKENS,
          },
  };
  if (CHAT_REASONING_MODE !== "off") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const edits: any[] = [
      {
        type: "clear_thinking_20251015",
        keep: { type: "thinking_turns", value: 1 },
      },
    ];

    if (supportsCompaction) {
      edits.push({
        type: "compact_20260112",
        trigger: {
          type: "input_tokens",
          value: CHAT_COMPACTION_TRIGGER_TOKENS,
        },
      });
    }

    anthropicProviderOptions.contextManagement = { edits };
  }

  const result = streamText({
    model: anthropic(CHAT_MODEL_ID),
    system: systemPrompt,
    messages: prunedMessages,
    maxOutputTokens: 8192,
    stopWhen: stepCountIs(20),
    providerOptions: {
      anthropic: anthropicProviderOptions,
    },
    tools: {
      fetchUrlContent: tool({
        description:
          "Fetch and read the full text content of any URL — blog posts, articles, web pages, etc. Use this whenever you need to understand or analyze a URL-sourced node in the graph. Do not ask the user to paste the content; just fetch it.",
        inputSchema: z.object({
          url: z.string().url().describe("The URL to fetch content from"),
        }),
        execute: async ({ url }: { url: string }) => {
          try {
            const res = await fetch(
              `${APP_BASE_URL}/api/fetch-content?url=${encodeURIComponent(url)}`
            );
            if (!res.ok) {
              return { error: `Failed to fetch content: ${res.statusText}`, url };
            }
            const data = (await res.json()) as { content?: string; truncated?: boolean; error?: string };
            if (data.error) return { error: data.error, url };
            return {
              url,
              content: data.content ?? "",
              truncated: data.truncated ?? false,
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : "Fetch failed", url };
          }
        },
      }),
      searchPapers: tool({
        description:
          "Search for papers/sources relevant to the question. Use this when you need fresh evidence before proposing graph changes.",
        inputSchema: z.object({
          query: z.string().describe("The search query for finding papers"),
          maxResults: z
            .number()
            .optional()
            .describe("Maximum number of results to return (default 10)"),
        }),
        execute: async ({ query, maxResults }: { query: string; maxResults?: number }) => {
          try {
            const res = await fetch(
              `${APP_BASE_URL}/api/search`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  text: query,
                  searchMode: "auto",
                  limit: maxResults ?? 10,
                }),
              }
            );
            if (!res.ok) return { error: `Search failed: ${res.statusText}` };
            const data = (await res.json()) as {
              status: "success" | "error";
              data?: { papers?: Array<Record<string, unknown>> };
              error?: string;
            };
            if (data.status !== "success") {
              return { error: data.error ?? "Search failed" };
            }
            const papers = data.data?.papers ?? [];
            return {
              papers: papers.slice(0, maxResults ?? 10),
              count: papers.length,
            };
          } catch (err) {
            return {
              error: err instanceof Error ? err.message : "Search failed",
            };
          }
        },
      }),
      expandPaper: tool({
        description:
          "Preview an expansion around a node before applying graph changes.",
        inputSchema: z.object({
          paperId: z.string().describe("The ID of the paper to expand"),
          mode: z
            .enum(["foundational", "recent", "contrasting"])
            .describe("Expansion strategy"),
          sourceUrl: z
            .string()
            .url()
            .optional()
            .describe("Optional source URL for URL/article nodes"),
          sourceTitle: z
            .string()
            .optional()
            .describe("Optional source title for URL/article nodes"),
        }),
        execute: async ({
          paperId,
          mode,
          sourceUrl,
          sourceTitle,
        }: {
          paperId: string;
          mode: "foundational" | "recent" | "contrasting";
          sourceUrl?: string;
          sourceTitle?: string;
        }) => {
          try {
            const res = await fetch(
              `${APP_BASE_URL}/api/expand`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  nodeId: paperId,
                  mode,
                  budget: 10,
                  sourceUrl,
                  sourceTitle,
                }),
              }
            );
            if (!res.ok) return { error: `Expansion failed: ${res.statusText}` };
            const data = (await res.json()) as {
              status: "success" | "error";
              data?: { papers?: Array<Record<string, unknown>>; edges?: Array<Record<string, unknown>> };
              error?: string;
            };
            if (data.status !== "success") {
              return { error: data.error ?? "Expansion failed" };
            }
            return {
              papers: data.data?.papers ?? [],
              edges: data.data?.edges ?? [],
            };
          } catch (err) {
            return {
              error: err instanceof Error ? err.message : "Expansion failed",
            };
          }
        },
      }),
      getPaperDetails: tool({
        description:
          "Get full details for a specific paper including abstract, authors, citation count, venue, and fields of study. Use when you need to answer questions about a specific paper in the graph.",
        inputSchema: z.object({
          paperId: z.string().describe("The ID of the paper to get details for"),
        }),
        execute: async ({ paperId }: { paperId: string }) => {
          try {
            const res = await fetch(`${APP_BASE_URL}/api/papers/${encodeURIComponent(paperId)}`);
            if (!res.ok) return { error: `Failed to get paper: ${res.statusText}`, paperId };
            const data = (await res.json()) as { data?: Record<string, unknown>; error?: string };
            if (data.error) return { error: data.error, paperId };
            return { paper: data.data, paperId };
          } catch (err) {
            return { error: err instanceof Error ? err.message : "Request failed", paperId };
          }
        },
      }),
      summarizeCluster: tool({
        description:
          "Summarize a cluster of related papers. Use the cluster and paper information from the project context to synthesize themes, methodologies, and key findings.",
        inputSchema: z.object({
          clusterId: z.string().describe("The ID of the cluster to summarize"),
        }),
        execute: async ({ clusterId }: { clusterId: string }) => {
          return {
            clusterId,
            message:
              "Use the papers and cluster description in the project context to summarize this cluster. Identify common themes, methodologies, and key findings.",
          };
        },
      }),
      findContradictions: tool({
        description:
          "Find papers that contradict or present opposing viewpoints to a given paper. Calls the expand API in contrasting mode.",
        inputSchema: z.object({
          paperId: z.string().describe("The ID of the paper to find contradictions for"),
          sourceUrl: z
            .string()
            .url()
            .optional()
            .describe("Optional source URL for URL/article nodes"),
          sourceTitle: z
            .string()
            .optional()
            .describe("Optional source title for URL/article nodes"),
        }),
        execute: async ({
          paperId,
          sourceUrl,
          sourceTitle,
        }: {
          paperId: string;
          sourceUrl?: string;
          sourceTitle?: string;
        }) => {
          try {
            const res = await fetch(`${APP_BASE_URL}/api/expand`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nodeId: paperId,
                mode: "contrasting",
                budget: 10,
                sourceUrl,
                sourceTitle,
              }),
            });
            if (!res.ok) return { error: `Expand failed: ${res.statusText}`, paperId };
            const data = (await res.json()) as {
              status: string;
              data?: { papers?: Array<Record<string, unknown>> };
              error?: string;
            };
            if (data.status !== "success") return { error: data.error ?? "Failed", paperId };
            return {
              paperId,
              contradictingPapers: data.data?.papers ?? [],
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : "Request failed", paperId };
          }
        },
      }),
      findGaps: tool({
        description:
          "Identify research gaps and blind spots in the current paper graph. Use the project context (papers, clusters, citations) to find: topics referenced but not explored, methodological gaps, temporal gaps, under-cited important work, missing connections between clusters.",
        inputSchema: z.object({}),
        execute: async () => {
          return {
            message:
              "Analyze the papers and clusters in the project context. Look for: (1) topics referenced but not explored, (2) methodological gaps, (3) temporal gaps, (4) under-cited but important work, (5) missing connections between clusters.",
          };
        },
      }),
      // Graph-mutating tools return action data; the client auto-executes them.
      addGraphNode: tool({
        description:
          "Add a source or paper node to the graph. IMPORTANT: Always pass `paperId` from search results so the graph can deduplicate nodes. The action executes automatically.",
        inputSchema: z.object({
          title: z.string().describe("Source or paper title"),
          url: z.string().url().optional().describe("Optional source URL (article, PDF, etc.)"),
          paperId: z.string().optional().describe("Existing canonical paper ID if adding from search/expand"),
          snippet: z.string().optional().describe("Optional abstract or snippet"),
          authors: z
            .array(
              z.union([
                z.string(),
                z.object({
                  id: z.string().optional(),
                  name: z.string(),
                }),
              ])
            )
            .optional()
            .describe("Optional author list"),
          year: z.number().optional().describe("Optional publication year"),
          citationCount: z.number().optional().describe("Optional citation count"),
          referenceCount: z.number().optional().describe("Optional reference count"),
          venue: z.string().optional().describe("Optional venue / journal / source"),
          openAccessPdf: z
            .string()
            .url()
            .optional()
            .describe("Optional direct PDF URL"),
          externalIds: z
            .object({
              doi: z.string().optional(),
              arxivId: z.string().optional(),
              semanticScholarId: z.string().optional(),
              corpusId: z.string().optional(),
              openAlexId: z.string().optional(),
              pubmedId: z.string().optional(),
            })
            .optional()
            .describe("Optional external identifiers"),
        }),
        execute: async ({ paperId, title }) => ({
          action: "addGraphNode",
          nodeId: paperId || "auto-generated",
          message: `Added "${title}" to graph (nodeId: ${paperId || "auto-generated"})`,
        }),
      }),
      connectGraphNodes: tool({
        description:
          "Connect two existing nodes with a directed edge. Use to record citations, semantic similarity, contradictions, or other relationships.",
        inputSchema: z.object({
          sourceId: z.string().describe("ID of the source node"),
          targetId: z.string().describe("ID of the target node"),
          edgeType: z
            .enum([
              "cites",
              "cited-by",
              "semantic-similarity",
              "same-author",
              "same-dataset",
              "methodologically-similar",
              "contradicts",
              "extends",
              "same-venue",
            ])
            .describe("Type of connection"),
          reason: z.string().optional().describe("Optional evidence or explanation for inferred edges"),
        }),
        execute: async ({ sourceId, targetId, edgeType }) => ({
          action: "connectGraphNodes",
          sourceId,
          targetId,
          message: `Connected ${sourceId} → ${targetId} (${edgeType})`,
        }),
      }),
      expandGraphNode: tool({
        description:
          "Expand a node to discover related papers: foundational (key references), recent (citing work), or contrasting (opposing views). Executes automatically.",
        inputSchema: z.object({
          nodeId: z.string().describe("ID of the node to expand"),
          mode: z
            .enum(["foundational", "recent", "contrasting"])
            .describe("Expansion strategy"),
          budget: z.number().optional().describe("Max number of new nodes (default from UI)"),
        }),
        execute: async () => ({
          action: "expandGraphNode",
          message: "Expanding node",
        }),
      }),
      mergeGraphClusters: tool({
        description:
          "Merge two clusters into one.",
        inputSchema: z.object({
          clusterIdA: z.string(),
          clusterIdB: z.string(),
        }),
        execute: async () => ({
          action: "mergeGraphClusters",
          message: "Merging clusters",
        }),
      }),
      archiveGraphNode: tool({
        description:
          "Archive a node (remove from active graph view). Requires user confirmation before executing.",
        inputSchema: z.object({
          nodeId: z.string().describe("ID of the node to archive"),
        }),
        execute: async () => ({
          action: "archiveGraphNode",
          message: "Archive requested — awaiting confirmation",
        }),
      }),
      relayoutGraph: tool({
        description:
          "Trigger a graph layout recomputation so nodes are repositioned.",
        inputSchema: z.object({}),
        execute: async () => ({
          action: "relayoutGraph",
          message: "Recomputing layout",
        }),
      }),
      addContradictionCard: tool({
        description:
          "Add a contradiction or opposing-view card linked to the graph.",
        inputSchema: z.object({
          anchorNodeId: z.string().optional().describe("Node this contradicts or relates to"),
          title: z.string().describe("Title of the contradictory source"),
          url: z.string().url().optional(),
          snippet: z.string().optional(),
          evidenceCardId: z.string().optional(),
        }),
        execute: async () => ({
          action: "addContradictionCard",
          message: "Adding contradiction card",
        }),
      }),
      saveCardForLater: tool({
        description:
          "Mark an evidence card as saved for later.",
        inputSchema: z.object({
          evidenceCardId: z.string().describe("ID of the evidence card to save"),
        }),
        execute: async () => ({
          action: "saveCardForLater",
          message: "Saving card for later",
        }),
      }),
      addSummaryNote: tool({
        description:
          "Add a standalone summary, question, or insight annotation to the graph. Use for cross-cutting synthesis that doesn't belong to a single paper (e.g. 'These papers converge on X'). Optionally attach to a specific node.",
        inputSchema: z.object({
          content: z.string().describe("The annotation text"),
          type: z.enum(["summary", "question", "insight"]).describe("Type of note: summary for syntheses, question for open questions, insight for observations"),
          attachedToNodeId: z.string().optional().describe("Optional node ID to attach this note to"),
        }),
        execute: async ({ content, type, attachedToNodeId }) => ({
          action: "addSummaryNote",
          content,
          type,
          attachedToNodeId,
          message: `Added ${type} note: "${content.slice(0, 60)}${content.length > 60 ? "..." : ""}"`,
        }),
      }),
      // Annotation tools — return action data for client-side execution
      addInsightToNode: tool({
        description:
          "Add an insight annotation to a node in the graph. Use when the user wants to note an observation, takeaway, or insight about a specific paper.",
        inputSchema: z.object({
          nodeId: z.string().describe("ID of the node to annotate"),
          content: z.string().describe("The insight text"),
        }),
        execute: async ({ nodeId, content }) => ({
          action: "addInsight",
          nodeId,
          content,
          message: `Insight added to node ${nodeId}`,
        }),
      }),
      markAsKeyFinding: tool({
        description:
          "Mark a node as a key finding / starred paper. Use when the user says a paper is important, key, or wants to star/favorite it.",
        inputSchema: z.object({
          nodeId: z.string().describe("ID of the node to mark"),
          description: z.string().optional().describe("Optional reason why this is a key finding"),
        }),
        execute: async ({ nodeId, description }) => ({
          action: "markAsKeyFinding",
          nodeId,
          description,
          message: `Marked node ${nodeId} as key finding`,
        }),
      }),
      markAsDeadEnd: tool({
        description:
          "Mark a node as a dead end. Use when the user says a paper is not relevant, a dead end, or should be deprioritized.",
        inputSchema: z.object({
          nodeId: z.string().describe("ID of the node to mark"),
          reason: z.string().optional().describe("Optional reason"),
        }),
        execute: async ({ nodeId, reason }) => ({
          action: "markAsDeadEnd",
          nodeId,
          reason,
          message: `Marked node ${nodeId} as dead end`,
        }),
      }),
      exportBibTeX: tool({
        description:
          "Tell the user how to export papers as BibTeX. Export uses the current graph state and is done from the app's Export panel or via the export API with papers from the graph.",
        inputSchema: z.object({
          nodeIds: z
            .array(z.string())
            .optional()
            .describe("Paper IDs to export. If empty, exports all papers in the graph."),
        }),
        execute: async () => ({
          message:
            "BibTeX export is available from the Export panel in the app (it uses the current graph). I can't run export from here because the graph data lives on your device. Open the Export panel to download BibTeX for the current papers, or filter by node IDs there.",
        }),
      }),
      draftLitReview: tool({
        description:
          "Suggest how to draft a literature review. The app can generate a review from the Export panel using the current graph. Use the project context to summarize themes and suggest an outline.",
        inputSchema: z.object({
          style: z
            .enum(["chronological", "thematic", "methodological"])
            .optional()
            .describe("Organization style for the review (default: thematic)"),
        }),
        execute: async ({ style }: { style?: string }) => ({
          message: `A literature review can be generated from the Export panel (markdown + AI review). Use the papers and clusters in the project context to summarize key themes and suggest an outline. Preferred style: ${style ?? "thematic"}.`,
        }),
      }),
      traceBacklinks: tool({
        description:
          "Find all papers in the current graph that cite or are cited by a given paper, and optionally fetch external citations/references from Semantic Scholar. Useful for tracing the lineage and impact of ideas.",
        inputSchema: z.object({
          nodeId: z.string().describe("ID of the paper to trace backlinks for"),
          direction: z
            .enum(["cites", "cited-by", "both"])
            .default("both")
            .describe("Direction of citation links: 'cites' = papers this one references, 'cited-by' = papers that cite this one, 'both' = all connections"),
        }),
        execute: async ({ nodeId, direction }: { nodeId: string; direction: "cites" | "cited-by" | "both" }) => {
          try {
            // Fetch external citations/references from Semantic Scholar
            const results: {
              externalCitations: Array<{ title: string; year?: number; citationCount: number; semanticScholarId: string }>;
              externalReferences: Array<{ title: string; year?: number; citationCount: number; semanticScholarId: string }>;
            } = {
              externalCitations: [],
              externalReferences: [],
            };

            // Resolve canonical IDs (s2:/doi:/arxiv:/pmid:) to S2 query tokens.
            const s2Id = canonicalIdToS2Query(nodeId);

            if (direction === "cited-by" || direction === "both") {
              try {
                const citations = await getPaperCitations(s2Id, { limit: 20 });
                results.externalCitations = citations.map((p) => ({
                  title: p.title,
                  year: p.year,
                  citationCount: p.citationCount,
                  semanticScholarId: p.externalIds.semanticScholarId ?? "",
                }));
              } catch {
                // S2 lookup may fail if nodeId is not a valid S2 ID
              }
            }

            if (direction === "cites" || direction === "both") {
              try {
                const references = await getPaperReferences(s2Id, { limit: 20 });
                results.externalReferences = references.map((p) => ({
                  title: p.title,
                  year: p.year,
                  citationCount: p.citationCount,
                  semanticScholarId: p.externalIds.semanticScholarId ?? "",
                }));
              } catch {
                // S2 lookup may fail if nodeId is not a valid S2 ID
              }
            }

            return {
              nodeId,
              direction,
              citedByCount: results.externalCitations.length,
              referencesCount: results.externalReferences.length,
              externalCitations: results.externalCitations.slice(0, 15),
              externalReferences: results.externalReferences.slice(0, 15),
              message: "Use the project context to identify which of these papers are already in the graph. Highlight connections the user may not have noticed.",
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : "Backlink tracing failed", nodeId };
          }
        },
      }),
      summarizeClusterData: tool({
        description:
          "Extract all papers belonging to a given cluster from the project context. Returns structured data (titles, abstracts, relationships) that you should then synthesize into a summary identifying common themes, key findings, and gaps.",
        inputSchema: z.object({
          clusterId: z.string().describe("ID of the cluster to summarize"),
        }),
        execute: async ({ clusterId }: { clusterId: string }) => {
          // Parse cluster and paper data from projectContext strings
          let clusterLabel = "";
          let clusterDescription = "";
          const paperTitles: string[] = [];
          const paperDetails: Array<{ title: string; year?: string; snippet: string }> = [];

          if (projectContext && Array.isArray(projectContext)) {
            for (const block of projectContext) {
              // Find the cluster block matching the clusterId
              const clusterRegex = new RegExp(
                `###\\s+(.+?)\\s*\\(.*?\\)\\n(.*?)\\nTop papers:\\n([\\s\\S]*?)(?=\\n###|$)`,
                "g"
              );
              let cm: RegExpExecArray | null;
              while ((cm = clusterRegex.exec(block)) !== null) {
                const label = cm[1].trim();
                // Match by label or by trying to find the clusterId in the text
                if (block.includes(clusterId) || label.toLowerCase().includes(clusterId.toLowerCase())) {
                  clusterLabel = label;
                  clusterDescription = cm[2].trim();
                  const paperLines = cm[3].trim().split("\n");
                  for (const line of paperLines) {
                    const titleMatch = line.match(/\[(.+?)(?:,\s*(\d{4}|n\.d\.))?\]/);
                    if (titleMatch) {
                      paperTitles.push(titleMatch[1]);
                    }
                  }
                }
              }

              // Also gather full paper digests that might match cluster papers
              const paperRegex = /\*\*\[(.+?)(?:,\s*(\d{4}|n\.d\.))?\]\*\*.*?\n([\s\S]*?)(?=\n\*\*\[|$)/g;
              let pm: RegExpExecArray | null;
              while ((pm = paperRegex.exec(block)) !== null) {
                const title = pm[1].trim();
                if (paperTitles.some((pt) => title.includes(pt) || pt.includes(title))) {
                  paperDetails.push({
                    title,
                    year: pm[2] || undefined,
                    snippet: pm[3].trim().slice(0, 300),
                  });
                }
              }
            }
          }

          return {
            clusterId,
            clusterLabel: clusterLabel || "Unknown cluster",
            clusterDescription,
            paperCount: Math.max(paperTitles.length, paperDetails.length),
            papers: paperTitles,
            paperDetails: paperDetails.slice(0, 20),
            instruction: "Synthesize these papers into a summary covering: (1) common themes and research questions, (2) key findings and contributions, (3) methodological approaches, (4) gaps or open questions, (5) how these papers relate to each other.",
          };
        },
      }),
      searchWithinHole: tool({
        description:
          "Search through papers already in the current rabbit hole by keyword, finding relevant papers without making external API calls. Matches against titles, abstracts, venues, and authors in the project context.",
        inputSchema: z.object({
          query: z.string().describe("Search query to match against paper titles, abstracts, and notes"),
          maxResults: z.number().optional().default(10).describe("Maximum number of results to return"),
        }),
        execute: async ({ query, maxResults }: { query: string; maxResults?: number }) => {
          const limit = maxResults ?? 10;
          const queryTerms = query
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 2);

          if (queryTerms.length === 0) {
            return { error: "Query too short or contains only stop words", query };
          }

          // Parse papers from projectContext
          const papers: Array<{
            title: string;
            id: string;
            year?: string;
            authors?: string;
            venue?: string;
            abstract: string;
            score: number;
          }> = [];

          if (projectContext && Array.isArray(projectContext)) {
            for (const block of projectContext) {
              // Match paper digest entries: **[Title, Year]** (ID: xxx)
              const paperRegex = /\*\*\[(.+?)(?:,\s*(\d{4}|n\.d\.))?\]\*\*\s*\(ID:\s*([^)]+)\)\s*\n([\s\S]*?)(?=\n\*\*\[|$)/g;
              let pm: RegExpExecArray | null;
              while ((pm = paperRegex.exec(block)) !== null) {
                const title = pm[1].trim();
                const year = pm[2] || undefined;
                const id = pm[3].trim();
                const details = pm[4].trim();

                // Score by term frequency in title (weight 3), abstract/details (weight 1)
                const titleLower = title.toLowerCase();
                const detailsLower = details.toLowerCase();

                let score = 0;
                for (const term of queryTerms) {
                  if (titleLower.includes(term)) score += 3;
                  if (detailsLower.includes(term)) score += 1;
                }

                if (score > 0) {
                  papers.push({
                    title,
                    id,
                    year,
                    abstract: details.slice(0, 200),
                    score,
                  });
                }
              }
            }
          }

          // Sort by relevance score descending
          papers.sort((a, b) => b.score - a.score);

          return {
            query,
            results: papers.slice(0, limit),
            totalMatches: papers.length,
            message: papers.length === 0
              ? "No papers in the current graph matched this query. Try using searchPapers to find external sources."
              : `Found ${papers.length} matching papers in the graph.`,
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: CHAT_REASONING_MODE === "full",
  });
}
