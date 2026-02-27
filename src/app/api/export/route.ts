import { NextResponse } from "next/server";
import { generateBibTeX, generateRIS, generateMarkdownReview } from "@/lib/utils/export";
import type { PaperMetadata, Cluster } from "@/types";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      format,
      papers,
      clusters,
      includeReview,
      style,
    }: {
      format: string;
      papers: PaperMetadata[];
      clusters?: Cluster[];
      includeReview?: boolean;
      style?: string;
    } = body;

    console.log("[research-rodeo] [export] format:", format, "papers:", papers?.length ?? 0);

    if (!papers || !Array.isArray(papers)) {
      return NextResponse.json(
        { error: "Papers array is required", status: "error" },
        { status: 400 }
      );
    }

    let content = "";

    switch (format) {
      case "bibtex":
        content = generateBibTeX(papers);
        break;

      case "ris":
        content = generateRIS(papers);
        break;

      case "json":
        content = JSON.stringify(papers, null, 2);
        break;

      case "markdown":
        if (includeReview) {
          // Use Anthropic to generate a proper literature review
          content = await generateAILitReview(papers, clusters, style);
        } else {
          content = generateMarkdownReview(papers, clusters);
        }
        break;

      default:
        return NextResponse.json(
          { error: `Unsupported format: ${format}`, status: "error" },
          { status: 400 }
        );
    }

    return NextResponse.json({
      data: { content, count: papers.length, format },
      status: "success",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json(
      { error: message, status: "error" },
      { status: 500 }
    );
  }
}

async function generateAILitReview(
  papers: PaperMetadata[],
  clusters?: Cluster[],
  style?: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fall back to template-based review
    return generateMarkdownReview(papers, clusters);
  }

  const paperSummaries = papers
    .slice(0, 50) // Limit for prompt size
    .map((p) => {
      const authors = p.authors
        .slice(0, 3)
        .map((a) => a.name)
        .join(", ");
      return `- "${p.title}" (${authors}, ${p.year ?? "n.d."}): ${p.abstract?.slice(0, 200) ?? "No abstract"}`;
    })
    .join("\n");

  const clusterInfo = clusters
    ? clusters.map((c) => `- ${c.label}: ${c.nodeIds.length} papers`).join("\n")
    : "No clusters defined";

  const organizationStyle = style ?? "thematic";

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `Write a literature review draft based on these papers. Organize ${organizationStyle}ly. Cite each paper as [Author, Year]. Be concise but comprehensive.

Clusters:
${clusterInfo}

Papers:
${paperSummaries}

Write the review in markdown format with clear sections.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.error("Request to Anthropic timed out after 15s");
    }
    return generateMarkdownReview(papers, clusters);
  }

  if (!response.ok) {
    return generateMarkdownReview(papers, clusters);
  }

  const data = await response.json();
  const reviewText =
    data.content?.[0]?.text ?? generateMarkdownReview(papers, clusters);

  return reviewText;
}
