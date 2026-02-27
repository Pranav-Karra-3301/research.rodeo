import { NextRequest, NextResponse } from "next/server";
import { fetchUrlContent } from "@/lib/server/scrape";
import { isPrivateUrl } from "@/lib/server/url-validation";

const MAX_CHARS = 15_000;

// ---------------------------------------------------------------------------
// Fallback: direct HTML fetch + heuristic text extraction
// ---------------------------------------------------------------------------

function removeNoiseTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function extractMainRegion(html: string): string {
  const mainRe =
    /<(?:article|main|div[^>]+(?:class|id)=["'][^"']*(content|post|article|entry|body|text)[^"']*["'])[^>]*>([\s\S]*?)<\/(?:article|main|div)>/i;
  const m = html.match(mainRe);
  if (m) return m[2] ?? m[0];
  const bodyM = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return bodyM ? bodyM[1] : html;
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchViaDirectHtml(targetUrl: string): Promise<string | null> {
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
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/pdf")) return null;

    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const decoder = new TextDecoder();
      let done = false;
      let bytes = 0;
      while (!done && bytes < 400_000) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          html += decoder.decode(value, { stream: !done });
          bytes += value.byteLength;
        }
      }
      reader.cancel().catch(() => {});
    }

    const cleaned = removeNoiseTags(html);
    const main = extractMainRegion(cleaned);
    return htmlToText(main);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

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

  const isPdf =
    /\.pdf(\?|#|$)/i.test(targetUrl) ||
    targetUrl.toLowerCase().includes("/pdf/");

  if (isPdf) {
    const pdfContent = await fetchUrlContent(targetUrl);
    if (pdfContent?.content) {
      const truncated = pdfContent.content.length > MAX_CHARS || pdfContent.truncated;
      const content = truncated
        ? pdfContent.content.slice(0, MAX_CHARS) + "\n\n[…content truncated…]"
        : pdfContent.content;
      return NextResponse.json({ url: targetUrl, content, truncated });
    }

    return NextResponse.json({
      url: targetUrl,
      content:
        "[PDF document — cannot extract text. The AI can reason about this paper from its title and abstract metadata.]",
      truncated: false,
    });
  }

  // Try Exa Contents API first, then Jina fallback (inside fetchUrlContent)
  const contentResult = await fetchUrlContent(targetUrl);
  if (contentResult && contentResult.content.trim().length > 50) {
    const truncated = contentResult.content.length > MAX_CHARS || contentResult.truncated;
    const content = truncated
      ? contentResult.content.slice(0, MAX_CHARS) + "\n\n[…content truncated…]"
      : contentResult.content;
    return NextResponse.json({ url: targetUrl, content, truncated });
  }

  // Fall back to direct HTML fetch + heuristic extraction
  const htmlText = await fetchViaDirectHtml(targetUrl);
  if (htmlText && htmlText.trim().length > 50) {
    const truncated = htmlText.length > MAX_CHARS;
    const content = truncated
      ? htmlText.slice(0, MAX_CHARS) + "\n\n[…content truncated…]"
      : htmlText;
    return NextResponse.json({ url: targetUrl, content, truncated });
  }

  return NextResponse.json(
    { error: "Could not extract content from this URL." },
    { status: 422 }
  );
}
