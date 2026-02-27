import { NextRequest, NextResponse } from "next/server";
import { scrapeMetadata } from "@/lib/server/scrape";
import type { ScrapeMetadata } from "@/lib/server/scrape";
import { isPrivateUrl } from "@/lib/server/url-validation";

export type ScrapeResult = ScrapeMetadata;

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let targetUrl: string;
  try {
    targetUrl = new URL(rawUrl).toString();
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (isPrivateUrl(targetUrl)) {
    return NextResponse.json({ error: "Forbidden: private/internal URLs are not allowed" }, { status: 403 });
  }

  const result = await scrapeMetadata(targetUrl);
  return NextResponse.json<ScrapeResult>(result);
}
