"use client";

import { ArrowRight, FileText, StickyNote, User, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, formatAuthors } from "@/lib/utils";
import type { SearchHit } from "@/lib/graph/search";
import type { PaperNode } from "@/types";

const FIELD_ICONS: Record<SearchHit["matchField"], React.ElementType> = {
  title: FileText,
  abstract: BookOpen,
  notes: StickyNote,
  authors: User,
  venue: BookOpen,
};

const FIELD_LABELS: Record<SearchHit["matchField"], string> = {
  title: "Title",
  abstract: "Abstract",
  notes: "Notes",
  authors: "Authors",
  venue: "Venue",
};

interface LocalSearchResultsProps {
  results: SearchHit[];
  nodes: Map<string, PaperNode>;
  selectedIdx: number;
  onSelect: (idx: number) => void;
  onNavigate: (nodeId: string) => void;
}

export function LocalSearchResults({
  results,
  nodes,
  selectedIdx,
  onSelect,
  onNavigate,
}: LocalSearchResultsProps) {
  return (
    <div className="p-2">
      <div className="px-3 py-1.5 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-[#a8a29e] font-medium">
          {results.length} match{results.length !== 1 ? "es" : ""} in graph
        </span>
      </div>
      {results.map((hit, i) => {
        const node = nodes.get(hit.nodeId);
        if (!node) return null;
        const Icon = FIELD_ICONS[hit.matchField];
        return (
          <div
            key={hit.nodeId}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer",
              selectedIdx === i ? "bg-[#f3f2ee]" : "hover:bg-[#f3f2ee]/60"
            )}
            onClick={() => onNavigate(hit.nodeId)}
            onMouseEnter={() => onSelect(i)}
          >
            <div className="flex-1 min-w-0">
              <h4 className="font-paper-title text-sm text-[#1c1917] leading-snug line-clamp-2">
                {node.data.title}
              </h4>
              <p className="text-xs text-[#78716c] mt-0.5">
                {formatAuthors(node.data.authors)}
                {node.data.year ? ` -- ${node.data.year}` : ""}
              </p>
              {hit.snippet && hit.matchField !== "title" && (
                <p className="text-xs text-[#a8a29e] mt-1 line-clamp-2 italic">
                  {hit.snippet}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-[#f3f2ee] text-[#57534e] rounded-full px-2 py-0.5 text-[10px] flex items-center gap-1">
                  <Icon className="w-2.5 h-2.5" />
                  {FIELD_LABELS[hit.matchField]}
                </span>
                <span className="text-[10px] text-[#a8a29e]">
                  {Math.round(hit.score * 100)}% match
                </span>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(hit.nodeId);
                }}
              >
                <ArrowRight className="w-3.5 h-3.5 text-[#7c3aed]" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
