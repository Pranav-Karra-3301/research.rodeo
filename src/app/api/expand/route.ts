import { NextRequest, NextResponse } from "next/server";
import type {
  FrontierRequest,
  FrontierResult,
  PaperMetadata,
  GraphEdge,
  ApiResponse,
} from "@/types";
import {
  getPaper,
  getPaperCitations,
  getPaperReferences,
} from "@/lib/api/semantic-scholar";
import { findSimilar, searchPapers as exaSearchPapers } from "@/lib/api/exa";
import {
  canonicalIdToS2Query,
  resolvePaper,
  isDuplicate,
} from "@/lib/api/paper-resolver";
import { nanoid } from "nanoid";

function inferCanonicalId(
  nodeId: string,
  externalIds?: PaperMetadata["externalIds"]
): string | null {
  if (
    nodeId.startsWith("s2:") ||
    nodeId.startsWith("doi:") ||
    nodeId.startsWith("arxiv:") ||
    nodeId.startsWith("pmid:")
  ) {
    return nodeId;
  }
  if (nodeId.startsWith("s2-")) return `s2:${nodeId.slice(3)}`;
  if (externalIds?.semanticScholarId) return `s2:${externalIds.semanticScholarId}`;
  if (externalIds?.doi) return `doi:${externalIds.doi}`;
  if (externalIds?.arxivId) return `arxiv:${externalIds.arxivId}`;
  if (externalIds?.pubmedId) return `pmid:${externalIds.pubmedId}`;
  return null;
}

function expansionFallbackQuery(
  mode: FrontierRequest["mode"],
  sourceTitleOrUrl: string
): string {
  if (mode === "foundational") {
    return `${sourceTitleOrUrl} foundational prior work seminal references`;
  }
  if (mode === "recent") {
    return `${sourceTitleOrUrl} recent follow-up research`;
  }
  return `${sourceTitleOrUrl} contrasting viewpoints criticism`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as FrontierRequest & {
      sourceUrl?: string;
      sourceTitle?: string;
      sourceExternalIds?: PaperMetadata["externalIds"];
    };

    if (!body.nodeId) {
      return NextResponse.json<ApiResponse<never>>(
        { error: "Missing 'nodeId' field", status: "error" },
        { status: 400 }
      );
    }

    const { nodeId, mode = "foundational", budget = 15, sourceUrl, sourceTitle, sourceExternalIds } = body;
    console.log("[research-rodeo] [expand] nodeId:", nodeId, "mode:", mode, "budget:", budget);

    let sourcePaper: PaperMetadata | null = null;
    let candidates: PaperMetadata[] = [];
    let usedSemanticScholar = false;

    // Prefer S2-backed expansion when the node has a canonical paper identifier.
    const canonicalId = inferCanonicalId(nodeId, sourceExternalIds);
    const s2Id = canonicalId ? canonicalIdToS2Query(canonicalId) : null;
    if (s2Id) {
      try {
        switch (mode) {
          case "foundational": {
            const [paper, refs] = await Promise.all([
              getPaper(s2Id),
              getPaperReferences(s2Id, { limit: budget * 2 }),
            ]);
            sourcePaper = paper;
            candidates = refs
              .sort((a, b) => b.citationCount - a.citationCount)
              .slice(0, budget);
            usedSemanticScholar = true;
            break;
          }

          case "recent": {
            const [paper, cites] = await Promise.all([
              getPaper(s2Id),
              getPaperCitations(s2Id, { limit: budget * 2 }),
            ]);
            sourcePaper = paper;
            candidates = cites
              .filter((p) => p.year)
              .sort((a, b) => (b.year || 0) - (a.year || 0))
              .slice(0, budget);
            usedSemanticScholar = true;
            break;
          }

          case "contrasting": {
            sourcePaper = await getPaper(s2Id);
            const resolvedForExa = resolvePaper(sourcePaper);
            const [similar, cites] = await Promise.allSettled([
              resolvedForExa.url
                ? findSimilar(resolvedForExa.url, {
                    numResults: Math.ceil(budget / 2),
                  })
                : Promise.resolve([]),
              getPaperCitations(s2Id, { limit: Math.ceil(budget / 2) }),
            ]);

            const similarPapers =
              similar.status === "fulfilled" ? similar.value : [];
            const citingPapers =
              cites.status === "fulfilled" ? cites.value : [];
            candidates = [...similarPapers, ...citingPapers];
            usedSemanticScholar = true;
            break;
          }

          default:
            return NextResponse.json<ApiResponse<never>>(
              {
                error: `Invalid mode: ${mode}. Use 'foundational', 'recent', or 'contrasting'.`,
                status: "error",
              },
              { status: 400 }
            );
        }
      } catch (err) {
        console.warn(
          "[research-rodeo] [expand] S2 expansion failed; falling back to Exa:",
          err instanceof Error ? err.message : err
        );
      }
    }

    // Fallback for URL/article nodes without S2 IDs.
    if (!usedSemanticScholar) {
      const sourceTitleOrUrl = sourceTitle?.trim() || sourceUrl?.trim();
      if (!sourceTitleOrUrl) {
        return NextResponse.json<ApiResponse<never>>(
          {
            error:
              "Cannot expand this source yet. Missing canonical paper ID and source URL/title context.",
            status: "error",
          },
          { status: 400 }
        );
      }

      sourcePaper = {
        id: nodeId,
        externalIds: sourceExternalIds ?? {},
        title: sourceTitle?.trim() || sourceTitleOrUrl,
        authors: [],
        citationCount: 0,
        referenceCount: 0,
        url: sourceUrl?.trim(),
      };

      if (sourceUrl?.trim()) {
        const similar = await findSimilar(sourceUrl.trim(), {
          numResults: budget * 2,
        });
        candidates = similar;
      } else {
        const query = expansionFallbackQuery(mode, sourceTitleOrUrl);
        candidates = await exaSearchPapers(query, {
          numResults: budget * 2,
          searchType: "auto",
        });
      }
    }

    if (!sourcePaper) {
      return NextResponse.json<ApiResponse<never>>(
        { error: "Could not resolve source paper for expansion", status: "error" },
        { status: 500 }
      );
    }

    const resolvedSource = resolvePaper(sourcePaper);

    // Deduplicate candidates
    const unique: PaperMetadata[] = [];
    for (const candidate of candidates) {
      const resolved = resolvePaper(candidate);
      if (resolved.id === resolvedSource.id) continue;
      if (unique.some((u) => isDuplicate(u, resolved))) continue;
      unique.push(resolved);
    }

    const papers = unique.slice(0, budget);

    // Build edges
    const edges: GraphEdge[] = papers.map((paper) => {
      let edgeType: GraphEdge["type"];
      switch (mode) {
        case "foundational":
          edgeType = "cites";
          break;
        case "recent":
          edgeType = "cited-by";
          break;
        case "contrasting":
          edgeType = "semantic-similarity";
          break;
        default:
          edgeType = "cites";
      }

      return {
        id: `edge-${nanoid(10)}`,
        source: nodeId,
        target: paper.id,
        type: edgeType,
        trust:
          usedSemanticScholar && mode !== "contrasting"
            ? ("source-backed" as const)
            : ("inferred" as const),
        weight: 0.5,
      };
    });

    const result: FrontierResult = {
      papers,
      edges,
      mode,
      sourceNodeId: nodeId,
    };
    console.log("[research-rodeo] [expand] result: papers=", papers.length, "edges=", edges.length);

    return NextResponse.json<ApiResponse<FrontierResult>>({
      data: result,
      status: "success",
    });
  } catch (error) {
    return NextResponse.json<ApiResponse<never>>(
      {
        error: error instanceof Error ? error.message : "Internal server error",
        status: "error",
      },
      { status: 500 }
    );
  }
}
