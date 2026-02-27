import { NextRequest, NextResponse } from "next/server";
import type { PaperMetadata, ApiResponse } from "@/types";
import { getPaper as s2GetPaper } from "@/lib/api/semantic-scholar";
import { getWork as oaGetWork } from "@/lib/api/openalex";
import { canonicalIdToS2Query, mergePapers, resolvePaper } from "@/lib/api/paper-resolver";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json<ApiResponse<never>>(
        { error: "Paper ID is required", status: "error" },
        { status: 400 }
      );
    }
    console.log("[research-rodeo] [papers] GET id:", id);

    // Determine lookup strategy from ID prefix
    const decodedId = decodeURIComponent(id);
    let paper: PaperMetadata | null = null;

    // Try Semantic Scholar first (works with S2 IDs, DOIs, arXiv IDs, etc.)
    try {
      paper = await s2GetPaper(canonicalIdToS2Query(decodedId));
    } catch {
      // S2 lookup failed, will try OpenAlex below
    }

    // Try OpenAlex enrichment or fallback
    let oaPaper: PaperMetadata | null = null;
    try {
      if (decodedId.startsWith("oa:")) {
        oaPaper = await oaGetWork(decodedId.slice(3));
      } else if (paper?.externalIds.doi) {
        oaPaper = await oaGetWork(`doi:${paper.externalIds.doi}`);
      } else if (paper?.externalIds.openAlexId) {
        oaPaper = await oaGetWork(paper.externalIds.openAlexId);
      }
    } catch {
      // OpenAlex enrichment is best-effort
    }

    // Merge results from both sources
    if (paper && oaPaper) {
      paper = mergePapers(paper, oaPaper);
    } else if (!paper && oaPaper) {
      paper = oaPaper;
    }

    if (!paper) {
      return NextResponse.json<ApiResponse<never>>(
        { error: `Paper not found: ${decodedId}`, status: "error" },
        { status: 404 }
      );
    }

    paper = resolvePaper(paper);
    console.log("[research-rodeo] [papers] found:", paper.title?.slice(0, 50));

    return NextResponse.json<ApiResponse<PaperMetadata>>({
      data: paper,
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
