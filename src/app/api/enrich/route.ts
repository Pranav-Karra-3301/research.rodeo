import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth/helpers";
import type { PaperMetadata, ApiResponse } from "@/types";
import {
  getPaper,
  getPaperCitations,
  getPaperReferences,
} from "@/lib/api/semantic-scholar";
import { getWork } from "@/lib/api/openalex";
import { findOpenAccess } from "@/lib/api/unpaywall";
import { canonicalIdToS2Query, mergePapers, resolvePaper } from "@/lib/api/paper-resolver";

interface EnrichResult {
  paper: PaperMetadata;
  citations: PaperMetadata[];
  references: PaperMetadata[];
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { paperId: string };

    if (!body.paperId) {
      return NextResponse.json<ApiResponse<never>>(
        { error: "Missing 'paperId' field", status: "error" },
        { status: 400 }
      );
    }

    const { paperId } = body;
    console.log("[research-rodeo] [enrich] paperId:", paperId);

    // Determine S2 lookup key from canonical ID
    const s2Query = canonicalIdToS2Query(paperId);

    // Fetch primary paper data and citations/references in parallel
    const [s2Paper, citations, references] = await Promise.all([
      getPaper(s2Query),
      getPaperCitations(s2Query, { limit: 50 }).catch(() => []),
      getPaperReferences(s2Query, { limit: 50 }).catch(() => []),
    ]);

    let paper = resolvePaper(s2Paper);

    // Enrich with OpenAlex and Unpaywall in parallel (async-parallel)
    const openAlexPromise =
      paper.externalIds.doi
        ? getWork(`doi:${paper.externalIds.doi}`).catch(() => null)
        : paper.externalIds.openAlexId
          ? getWork(paper.externalIds.openAlexId).catch(() => null)
          : Promise.resolve(null);
    const unpaywallPromise =
      !paper.openAccessPdf && paper.externalIds.doi
        ? findOpenAccess(paper.externalIds.doi).catch(() => null)
        : Promise.resolve(null);

    const [oaPaper, oaResult] = await Promise.all([
      openAlexPromise,
      unpaywallPromise,
    ]);

    if (oaPaper) paper = mergePapers(paper, oaPaper);
    if (oaResult?.isOpenAccess && oaResult.bestUrl) {
      paper = { ...paper, openAccessPdf: oaResult.bestUrl };
    }

    // Resolve all citation/reference papers
    const resolvedCitations = citations.map(resolvePaper);
    const resolvedReferences = references.map(resolvePaper);

    const result: EnrichResult = {
      paper,
      citations: resolvedCitations,
      references: resolvedReferences,
    };
    console.log("[research-rodeo] [enrich] result: citations=", resolvedCitations.length, "references=", resolvedReferences.length);

    return NextResponse.json<ApiResponse<EnrichResult>>({
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
