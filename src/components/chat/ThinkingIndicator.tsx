"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ThinkingIndicatorProps {
  label: string;
  isActive: boolean;
}

export function ThinkingIndicator({ label, isActive }: ThinkingIndicatorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className="flex items-center gap-1.5 text-xs text-[#78716c] hover:text-[#57534e] transition-colors py-1"
    >
      <ChevronRight
        className={cn(
          "h-3 w-3 transition-transform",
          expanded && "rotate-90"
        )}
      />
      <span>{label}</span>
      {isActive && (
        <span className="thinking-dots ml-1">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      )}
    </button>
  );
}
