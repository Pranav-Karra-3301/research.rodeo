import { NextRequest, NextResponse } from "next/server";
import type { ScopeQuestion } from "@/types";

function buildScopeQuestions(question: string): ScopeQuestion[] {
  const normalized = question.toLowerCase();

  const candidates: ScopeQuestion[] = [
    {
      id: "goal",
      question: "What exact decision or output do you want by the end of this rabbit hole?",
      rationale: "Defines success criteria for source selection.",
    },
    {
      id: "boundary",
      question: "What should be explicitly in-scope vs out-of-scope?",
      rationale: "Prevents graph sprawl and irrelevant expansions.",
    },
    {
      id: "timeframe",
      question: normalized.includes("history") || normalized.includes("foundational")
        ? "Do you want mostly foundational work, recent work, or a mix?"
        : "What publication or evidence timeframe matters most (e.g. last 2 years vs foundational)?",
      rationale: "Sets expansion direction for Layer 2.",
    },
    {
      id: "quality-bar",
      question: "What confidence bar should we use when prioritizing evidence cards?",
      rationale: "Controls how aggressively we include weaker evidence.",
    },
  ];

  return candidates.slice(0, 4);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      question?: string;
      maxQuestions?: number;
    };
    const question = body.question?.trim();
    if (!question) {
      return NextResponse.json(
        { status: "error", error: "Missing question" },
        { status: 400 }
      );
    }

    const maxQuestions = Math.min(Math.max(body.maxQuestions ?? 4, 2), 4);
    const questions = buildScopeQuestions(question).slice(0, maxQuestions);

    return NextResponse.json({
      status: "success",
      data: { question, questions },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: error instanceof Error ? error.message : "Failed to build scope questions",
      },
      { status: 500 }
    );
  }
}

