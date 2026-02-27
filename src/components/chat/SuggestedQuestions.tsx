"use client";

import { cn } from "@/lib/utils";

const DEFAULT_QUESTIONS = [
  "What are the key disagreements in this field?",
  "Summarize the main approaches",
  "Find gaps in my research",
  "Draft a literature review",
];

interface SuggestedQuestionsProps {
  questions?: string[];
  onSelect: (question: string) => void;
  className?: string;
}

export function SuggestedQuestions({
  questions = DEFAULT_QUESTIONS,
  onSelect,
  className,
}: SuggestedQuestionsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2 justify-center", className)}>
      {questions.map((question) => (
        <button
          key={question}
          onClick={() => onSelect(question)}
          className="text-xs px-3 py-1.5 rounded-full border border-[#dddcd7]/60 text-[#57534e] hover:text-[#1c1917] hover:border-[#dddcd7] hover:bg-[#f3f2ee]/50 transition-colors"
        >
          {question}
        </button>
      ))}
    </div>
  );
}
