import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { scrapeMetadata, fetchUrlContent } from "@/lib/server/scrape";
import { isPrivateUrl } from "@/lib/server/url-validation";
import { getUserId } from "@/lib/auth/helpers";

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { url, rabbit_hole_id } = body as { url: string; rabbit_hole_id: string };

    if (!url || !rabbit_hole_id) {
      return NextResponse.json({ error: "url and rabbit_hole_id are required" }, { status: 400 });
    }

    if (isPrivateUrl(url.trim())) {
      return NextResponse.json({ error: "Forbidden: private/internal URLs are not allowed" }, { status: 403 });
    }

    const normalizedUrl = url.trim();
    const t0 = Date.now();

    // Run metadata scrape and Exa-first content fetch in parallel
    const [meta, pageContent] = await Promise.all([
      scrapeMetadata(normalizedUrl),
      fetchUrlContent(normalizedUrl),
    ]);

    console.log(`[sources/add] scraped ${normalizedUrl} in ${Date.now() - t0}ms — ogImage: ${meta.ogImage ?? "none"}`);

    const nodeId = `url-${nanoid(10)}`;
    const now = Date.now();

    const nodeData = {
      id: nodeId,
      externalIds: {},
      title: meta.title,
      authors: [],
      citationCount: 0,
      referenceCount: 0,
      url: meta.url,
      openAccessPdf: meta.isPdf ? meta.url : undefined,
      abstract: meta.description,
      ogImage: meta.ogImage,
      faviconUrl: meta.faviconUrl,
      siteDescription: meta.description,
      siteName: meta.siteName,
      isUrlSource: true,
    };

    const scores = {
      relevance: 0,
      influence: 0,
      recency: 0,
      semanticSimilarity: 0,
      localCentrality: 0,
      velocity: 0,
    };

    return NextResponse.json({
      nodeId,
      rabbitHoleId: rabbit_hole_id,
      dataJson: JSON.stringify(nodeData),
      scoresJson: JSON.stringify(scores),
      state: "materialized",
      addedAt: now,
      content: pageContent?.content ?? null,
      contentTruncated: pageContent?.truncated ?? false,
      metadata: {
        title: meta.title,
        description: meta.description,
        ogImage: meta.ogImage,
        faviconUrl: meta.faviconUrl,
        siteName: meta.siteName,
        isPdf: meta.isPdf,
      },
    });
  } catch (err) {
    console.error("[sources/add] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
