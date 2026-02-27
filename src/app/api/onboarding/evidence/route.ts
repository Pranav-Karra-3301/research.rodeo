import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { searchEvidence } from "@/lib/api/exa";
import { resolvePaper } from "@/lib/api/paper-resolver";
import type {
  EvidenceCardType,
  PaperMetadata,
  RabbitHoleLayer,
} from "@/types";

function confidenceFromScore(score: number | undefined): "high" | "medium" | "low" {
  if ((score ?? 0) >= 0.75) return "high";
  if ((score ?? 0) >= 0.5) return "medium";
  return "low";
}

function parseYear(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const value = new Date(date).getFullYear();
  return Number.isFinite(value) ? value : undefined;
}

function cardTypeForLayer(layer: RabbitHoleLayer, text: string): EvidenceCardType {
  if (layer !== 3) return "source";
  const normalized = text.toLowerCase();
  if (
    normalized.includes("contradict") ||
    normalized.includes("inconsistent") ||
    normalized.includes("oppos")
  ) {
    return "contradiction";
  }
  return "gap";
}

function queryForLayer(layer: RabbitHoleLayer, question: string): string {
  if (layer === 1) return question;
  if (layer === 2) return `${question} foundational references recent citations`;
  return `${question} contradiction criticism replication failure unresolved gap open problem`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      question?: string;
      layer?: RabbitHoleLayer;
      scopeAnswers?: Record<string, string>;
      domains?: string[];
      limit?: number;
    };

    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json(
        { status: "error", error: "Missing question" },
        { status: 400 }
      );
    }

    const layer = body.layer ?? 1;
    const scopeBlob = body.scopeAnswers
      ? Object.values(body.scopeAnswers).filter(Boolean).join(" ")
      : "";
    const composedQuery = `${queryForLayer(layer, question)} ${scopeBlob}`.trim();
    const hits = await searchEvidence(composedQuery, {
      numResults: Math.min(Math.max(body.limit ?? 8, 3), 20),
      includeDomains: body.domains,
      searchType: layer === 1 ? "instant" : "auto",
    });

    const cards = hits.map((hit) => {
      const snippet = hit.highlights?.[0] ?? hit.text?.slice(0, 280) ?? "";
      const cardType = cardTypeForLayer(layer, `${hit.title} ${snippet}`);
      const paper: PaperMetadata = resolvePaper({
        id: "",
        externalIds: {},
        title: hit.title || "Untitled source",
        authors: [],
        year: parseYear(hit.publishedDate),
        abstract: hit.text?.slice(0, 1200),
        citationCount: 0,
        referenceCount: 0,
        url: hit.url,
      });
      return {
        id: `evi-${nanoid(10)}`,
        layer,
        type: cardType,
        title: hit.title,
        url: hit.url,
        snippet,
        confidence: confidenceFromScore(hit.score),
        citations: [
          {
            title: hit.title,
            url: hit.url,
            snippet,
          },
        ],
        paper,
        exaScore: hit.score,
      };
    });

    return NextResponse.json({
      status: "success",
      data: {
        layer,
        query: composedQuery,
        cards,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Failed to fetch evidence",
      },
      { status: 500 }
    );
  }
}

