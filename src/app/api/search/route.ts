import { NextRequest, NextResponse } from "next/server";
import type { SearchQuery, SearchResult, ApiResponse } from "@/types";
import { searchPapers as exaSearch, deepSearch } from "@/lib/api/exa";
import { searchPapers as s2Search } from "@/lib/api/semantic-scholar";
import { resolvePaper } from "@/lib/api/paper-resolver";
import { getUserId } from "@/lib/auth/helpers";

/**
 * Search modes map to Exa API search types:
 * - auto: smart mix of neural + keyword (default)
 * - instant: sub-200ms, real-time optimized
 * - fast: streamlined neural search
 * - deep: multi-pass thorough search (uses deepSearch with academic domains)
 * - deep-reasoning: base deep search variant
 * - deep-max: maximum-effort deep search
 */
type SearchMode = "auto" | "instant" | "fast" | "deep" | "deep-reasoning" | "deep-max";

interface SearchRequestBody extends SearchQuery {
  searchMode?: SearchMode;
  domains?: string[];
  limit?: number;
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as SearchRequestBody;

    // Accept both "text" and "query" field names for convenience
    const queryText = (body.text ?? (body as unknown as Record<string, unknown>).query) as string | undefined;

    if (!queryText || typeof queryText !== "string") {
      return NextResponse.json<ApiResponse<never>>(
        { error: "Missing or invalid 'text' field", status: "error" },
        { status: 400 }
      );
    }

    const query = queryText.trim();
    const filters = body.filters;
    const searchMode: SearchMode = body.searchMode ?? "auto";
    const domains = body.domains;
    const limit = Math.min(Math.max(body.limit ?? 10, 1), 50);

    console.log(
      "[rabbit-hole] [search] query:", query,
      "mode:", searchMode,
      "limit:", limit,
      "domains:", domains ?? "none",
      "filters:", filters ?? "none"
    );

    let result: SearchResult;
    try {
      // Deep variants use the deepSearch function with academic domains
      if (searchMode === "deep" || searchMode === "deep-reasoning" || searchMode === "deep-max") {
        const papers = await deepSearch(query, {
          numResults: limit,
          includeDomains: domains,
          startPublishedDate: filters?.yearMin
            ? `${filters.yearMin}-01-01`
            : undefined,
          endPublishedDate: filters?.yearMax
            ? `${filters.yearMax}-12-31`
            : undefined,
        });

        const resolved = papers.map((p) => {
          const { sourceType: _, ...rest } = p;
          return resolvePaper(rest);
        });

        result = { papers: resolved, query, source: "exa" };
      } else {
        // auto, instant, fast — pass search type directly to Exa
        const exaOptions: Record<string, unknown> = {
          numResults: limit,
          searchType: searchMode,
        };

        if (domains && domains.length > 0) {
          exaOptions.includeDomains = domains;
        }
        if (filters?.yearMin) {
          exaOptions.startPublishedDate = `${filters.yearMin}-01-01`;
        }
        if (filters?.yearMax) {
          exaOptions.endPublishedDate = `${filters.yearMax}-12-31`;
        }

        const papers = await exaSearch(query, exaOptions);
        const resolved = papers.map(resolvePaper);
        result = { papers: resolved, query, source: "exa" };
      }
    } catch (exaError) {
      console.warn(
        "[rabbit-hole] [search] Exa failed, falling back to Semantic Scholar:",
        exaError instanceof Error ? exaError.message : exaError
      );
      // Fallback to Semantic Scholar when Exa fails
      try {
        const { papers } = await s2Search(query, { limit });
        const resolved = papers.map(resolvePaper);
        result = { papers: resolved, query, source: "semantic-scholar" };
      } catch (s2Error) {
        return NextResponse.json<ApiResponse<never>>(
          {
            error: `Search failed: Exa (${exaError instanceof Error ? exaError.message : "unknown"}), S2 (${s2Error instanceof Error ? s2Error.message : "unknown"})`,
            status: "error",
          },
          { status: 502 }
        );
      }
    }

    // Apply post-search filters
    if (filters) {
      result.papers = result.papers.filter((paper) => {
        if (filters.yearMin && paper.year && paper.year < filters.yearMin)
          return false;
        if (filters.yearMax && paper.year && paper.year > filters.yearMax)
          return false;
        if (filters.minCitations && paper.citationCount < filters.minCitations)
          return false;
        if (filters.openAccessOnly && !paper.openAccessPdf) return false;
        if (
          filters.fieldsOfStudy &&
          filters.fieldsOfStudy.length > 0 &&
          paper.fieldsOfStudy
        ) {
          const hasOverlap = paper.fieldsOfStudy.some((f) =>
            filters.fieldsOfStudy!.some(
              (sf) => sf.toLowerCase() === f.toLowerCase()
            )
          );
          if (!hasOverlap) return false;
        }
        return true;
      });
    }

    console.log(
      "[rabbit-hole] [search] result: source=",
      result.source,
      "papers=",
      result.papers.length
    );
    return NextResponse.json<ApiResponse<SearchResult>>({
      data: result,
      status: "success",
    });
  } catch (error) {
    console.error(
      "[rabbit-hole] [search] error:",
      error instanceof Error ? error.message : error
    );
    return NextResponse.json<ApiResponse<never>>(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
        status: "error",
      },
      { status: 500 }
    );
  }
}
