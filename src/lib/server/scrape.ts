/**
 * Server-side URL scraping utilities shared by /api/scrape and /api/sources/add.
 * Uses parallel direct-HTML fetch + Jina AI reader for metadata reliability,
 * and Exa Contents API (with Jina fallback) for page text extraction.
 */

import { getContentText } from "@/lib/api/exa";

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function parseTagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w[\w:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    const key = m[1].toLowerCase();
    const val = m[2] ?? m[3] ?? m[4] ?? "";
    attrs[key] = decodeEntities(val);
  }
  return attrs;
}

function extractMeta(html: string, prop: string): string | undefined {
  const metaRe = /<meta\s([^>]+?)(?:\s*\/?>)/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const attrs = parseTagAttributes(m[1]);
    const nameVal = attrs["property"] ?? attrs["name"] ?? "";
    if (nameVal.toLowerCase() === prop.toLowerCase() && attrs["content"]) {
      return attrs["content"].trim();
    }
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : undefined;
}

function resolveUrl(href: string, base: string): string {
  if (href.startsWith("http")) return href;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

export function googleFavicon(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Jina AI Reader (handles JS-rendered pages, no API key required)
// ---------------------------------------------------------------------------

interface JinaMeta {
  title?: string;
  description?: string;
  url?: string;
  ogImage?: string;
}

export async function fetchJinaMeta(url: string): Promise<JinaMeta | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: "application/json",
        "X-No-Cache": "true",
        "X-Return-Format": "html",
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      code: number;
      data?: {
        title?: string;
        description?: string;
        url?: string;
        images?: Record<string, string>;
      };
    };

    if (json.code !== 200 || !json.data) return null;

    // Pick first image URL — Jina doesn't expose og:image separately so the
    // first entry in the images map is usually the hero/og image
    const firstImage = json.data.images
      ? Object.keys(json.data.images)[0]
      : undefined;

    return {
      title: json.data.title?.trim() || undefined,
      description: json.data.description?.trim() || undefined,
      url: json.data.url || undefined,
      ogImage: firstImage,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Jina AI Reader — markdown content fetch
// ---------------------------------------------------------------------------

const MAX_CONTENT_CHARS = 40_000;

async function fetchExaContent(url: string): Promise<{ content: string; truncated: boolean } | null> {
  try {
    return await getContentText(url, {
      maxCharacters: MAX_CONTENT_CHARS,
      maxAgeHours: 24,
    });
  } catch {
    return null;
  }
}

export async function fetchJinaContent(url: string): Promise<{ content: string; truncated: boolean } | null> {
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Accept: "text/markdown",
        "X-No-Cache": "true",
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    const truncated = text.length > MAX_CONTENT_CHARS;
    return { content: text.slice(0, MAX_CONTENT_CHARS), truncated };
  } catch {
    return null;
  }
}

export async function fetchUrlContent(url: string): Promise<{ content: string; truncated: boolean } | null> {
  const exaContent = await fetchExaContent(url);
  if (exaContent && exaContent.content.trim().length > 80) {
    return exaContent;
  }
  return fetchJinaContent(url);
}

// ---------------------------------------------------------------------------
// Direct HTML fetch — reads <head> for og: meta tags
// ---------------------------------------------------------------------------

interface HtmlMeta {
  url: string;
  ogTitle?: string;
  pageTitle?: string;
  ogDescription?: string;
  metaDescription?: string;
  ogImage?: string;
  ogSiteName?: string;
}

export async function fetchHtmlMeta(targetUrl: string): Promise<HtmlMeta | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    // Read first 150 KB — enough to capture <head>
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let done = false;
      let bytes = 0;
      while (!done && bytes < 150_000) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          html += decoder.decode(value, { stream: !done });
          bytes += value.byteLength;
        }
      }
      reader.cancel().catch(() => {});
    }

    const ogImage = extractMeta(html, "og:image");

    return {
      url: res.url,
      ogTitle: extractMeta(html, "og:title"),
      pageTitle: extractTitle(html),
      ogDescription: extractMeta(html, "og:description"),
      metaDescription: extractMeta(html, "description"),
      ogImage: ogImage ? resolveUrl(ogImage, res.url) : undefined,
      ogSiteName: extractMeta(html, "og:site_name"),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-memory metadata cache
// ---------------------------------------------------------------------------

const metadataCache = new Map<string, { data: ScrapeMetadata; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCachedMetadata(url: string): ScrapeMetadata | null {
  const cached = metadataCache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (cached) metadataCache.delete(url);
  return null;
}

// ---------------------------------------------------------------------------
// Combined scrape: runs HTML + Jina in parallel, merges results
// ---------------------------------------------------------------------------

export interface ScrapeMetadata {
  url: string;
  title: string;
  description?: string;
  ogImage?: string;
  faviconUrl: string;
  siteName: string;
  isPdf: boolean;
}

export async function scrapeMetadata(targetUrl: string): Promise<ScrapeMetadata> {
  const cached = getCachedMetadata(targetUrl);
  if (cached) return cached;

  const isPdf =
    /\.pdf(\?|#|$)/i.test(targetUrl) || targetUrl.toLowerCase().includes("/pdf/");

  const hostname = (() => {
    try { return new URL(targetUrl).hostname; } catch { return targetUrl; }
  })();

  if (isPdf) {
    const pathParts = new URL(targetUrl).pathname.split("/");
    const filename = pathParts[pathParts.length - 1] || "document.pdf";
    const pdfResult: ScrapeMetadata = {
      url: targetUrl,
      title: decodeURIComponent(filename),
      faviconUrl: googleFavicon(targetUrl),
      siteName: hostname.replace(/^www\./, ""),
      isPdf: true,
    };
    metadataCache.set(targetUrl, { data: pdfResult, ts: Date.now() });
    return pdfResult;
  }

  const [htmlSettled, jinaSettled] = await Promise.allSettled([
    fetchHtmlMeta(targetUrl),
    fetchJinaMeta(targetUrl),
  ]);

  const html = htmlSettled.status === "fulfilled" ? htmlSettled.value : null;
  const jina = jinaSettled.status === "fulfilled" ? jinaSettled.value : null;

  const finalUrl = html?.url ?? jina?.url ?? targetUrl;

  const title =
    html?.ogTitle ||
    jina?.title ||
    html?.pageTitle ||
    hostname;

  const description =
    html?.ogDescription ||
    jina?.description ||
    html?.metaDescription;

  // HTML direct parse is more reliable for og:image than Jina
  const ogImage = html?.ogImage ?? jina?.ogImage;

  const siteName =
    html?.ogSiteName ||
    hostname.replace(/^www\./, "");

  const result: ScrapeMetadata = {
    url: finalUrl,
    title: title ?? hostname,
    description,
    ogImage,
    faviconUrl: googleFavicon(finalUrl),
    siteName,
    isPdf: false,
  };
  metadataCache.set(targetUrl, { data: result, ts: Date.now() });
  return result;
}
