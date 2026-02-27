import { NextRequest, NextResponse } from "next/server";
import type { SearchQuery, SearchResult, ApiResponse } from "@/types";
import { searchPapers as exaSearch, deepSearch } from "@/lib/api/exa";
import { searchPapers as s2Search } from "@/lib/api/semantic-scholar";
import { resolvePaper } from "@/lib/api/paper-resolver";
import { deriveArxivLinks, isArxivUrl } from "@/lib/utils/arxiv-urls";

type SearchMode = "auto" | "instant" | "deep";

interface SearchRequestBody extends SearchQuery {
  searchMode?: SearchMode;
  domains?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SearchRequestBody;

    if (!body.text || typeof body.text !== "string") {
      return NextResponse.json<ApiResponse<never>>(
        { error: "Missing or invalid 'text' field", status: "error" },
        { status: 400 }
      );
    }

    const query = body.text.trim();
    const filters = body.filters;
    const searchMode: SearchMode = body.searchMode ?? "auto";
    const domains = body.domains;

    console.log(
      "[research-rodeo] [search] query:", query,
      "mode:", searchMode,
      "domains:", domains ?? "none",
      "filters:", filters ?? "none"
    );

    let result: SearchResult;
    try {
      if (searchMode === "deep") {
        const papers = await deepSearch(query, {
          numResults: 20,
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
        const exaOptions: Record<string, unknown> = {
          numResults: 10,
          searchType: searchMode === "instant" ? "instant" : "auto",
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
      try {
        const { papers } = await s2Search(query, { limit: 10 });
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

    // Enrich arXiv results with derived PDF/HTML links
    result.papers = result.papers.map((paper) => {
      if (paper.url && isArxivUrl(paper.url)) {
        const links = deriveArxivLinks(paper.url);
        if (links && !paper.openAccessPdf) {
          paper.openAccessPdf = links.pdf;
        }
      }
      return paper;
    });

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
      "[research-rodeo] [search] result: source=",
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
      "[research-rodeo] [search] error:",
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
