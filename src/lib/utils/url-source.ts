import { nanoid } from "nanoid";
import type { PaperNode, PaperMetadata } from "@/types";

export interface ScrapeResult {
  url: string;
  title: string;
  description?: string;
  ogImage?: string;
  faviconUrl?: string;
  siteName?: string;
  isPdf: boolean;
}

const ZERO_SCORES = {
  relevance: 0,
  influence: 0,
  recency: 0,
  semanticSimilarity: 0,
  localCentrality: 0,
  velocity: 0,
};

/**
 * Human-readable label from URL (domain + short path).
 */
export function labelFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname.slice(0, 40);
    return path ? `${host}${path}${path.length >= 40 ? "…" : ""}` : host;
  } catch {
    return url.slice(0, 50) + (url.length > 50 ? "…" : "");
  }
}

/**
 * Create a materialized paper node from a single URL with optional scraped metadata.
 */
export function createNodeFromUrl(url: string, scraped?: ScrapeResult): PaperNode {
  const trimmed = url.trim();
  const id = `url-${nanoid(10)}`;
  const isPdf =
    scraped?.isPdf ??
    (/\.pdf(\?|$)/i.test(trimmed) || trimmed.toLowerCase().includes("/pdf/"));
  const sourceType = getSourceType(trimmed);

  // For Wikipedia, try to extract a clean title from the URL path
  let title = scraped?.title ?? labelFromUrl(trimmed);
  if (sourceType === "wikipedia" && !scraped?.title) {
    const wikiName = getWikipediaArticleName(trimmed);
    if (wikiName) title = wikiName;
  }

  const siteName =
    scraped?.siteName ??
    (sourceType === "wikipedia" ? "Wikipedia" : undefined);

  const data: PaperMetadata = {
    id,
    externalIds: {},
    title,
    authors: [],
    citationCount: 0,
    referenceCount: 0,
    url: scraped?.url ?? trimmed,
    openAccessPdf: isPdf ? (scraped?.url ?? trimmed) : undefined,
    abstract: scraped?.description,
    ogImage: scraped?.ogImage,
    faviconUrl: scraped?.faviconUrl ??
      (sourceType === "wikipedia"
        ? "https://en.wikipedia.org/static/favicon/wikipedia.ico"
        : undefined),
    siteDescription: scraped?.description,
    siteName,
    isUrlSource: true,
  };

  return {
    id,
    data,
    state: "materialized",
    position: { x: 0, y: 0 },
    scores: ZERO_SCORES,
    addedAt: Date.now(),
  };
}

export type SourceType = "paper" | "wikipedia" | "youtube" | "article" | "unknown";

/**
 * Detect the type of source from a URL.
 * Used to provide type-specific icons and handling in the UI.
 */
export function getSourceType(url: string): SourceType {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("wikipedia.org")) return "wikipedia";
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube";
    if (
      hostname.includes("arxiv.org") ||
      hostname.includes("semanticscholar.org") ||
      hostname.includes("openreview.net") ||
      hostname.includes("acm.org") ||
      hostname.includes("ieee.org") ||
      hostname.includes("doi.org")
    )
      return "paper";
    return "article";
  } catch {
    return "unknown";
  }
}

/**
 * Detect if a URL is a Wikipedia article and extract clean metadata.
 */
export function isWikipediaUrl(url: string): boolean {
  try {
    return new URL(url).hostname.includes("wikipedia.org");
  } catch {
    return false;
  }
}

/**
 * Extract the Wikipedia article name from a URL.
 */
export function getWikipediaArticleName(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.includes("wikipedia.org")) return null;
    const match = u.pathname.match(/\/wiki\/(.+)/);
    if (match) return decodeURIComponent(match[1]).replace(/_/g, " ");
    return null;
  } catch {
    return null;
  }
}

export function isValidSourceUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  try {
    const u = new URL(trimmed);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function scrapeUrl(url: string): Promise<ScrapeResult | null> {
  try {
    const res = await fetch(
      `/api/scrape?url=${encodeURIComponent(url)}`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
