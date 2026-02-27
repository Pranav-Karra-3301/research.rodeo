"use client";

import { Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, formatAuthors, formatCount } from "@/lib/utils";
import { extractDomain } from "@/lib/utils/arxiv-urls";
import type { PaperMetadata } from "@/types";

interface SearchResultsProps {
  results: PaperMetadata[];
  selectedIdx: number;
  onSelect: (idx: number) => void;
  onAdd: (paper: PaperMetadata) => void;
  onAddAll: () => void;
}

export function SearchResults({
  results,
  selectedIdx,
  onSelect,
  onAdd,
  onAddAll,
}: SearchResultsProps) {
  return (
    <div className="p-2">
      {results.map((paper, i) => (
        <div
          key={paper.id}
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer",
            selectedIdx === i ? "bg-[#f3f2ee]" : "hover:bg-[#f3f2ee]/60"
          )}
          onClick={() => onAdd(paper)}
          onMouseEnter={() => onSelect(i)}
        >
          <div className="flex-1 min-w-0">
            <h4 className="font-paper-title text-sm text-[#1c1917] leading-snug line-clamp-2">
              {paper.title}
            </h4>
            <p className="text-xs text-[#78716c] mt-0.5">
              {formatAuthors(paper.authors)}
              {paper.year ? ` -- ${paper.year}` : ""}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {paper.url && (
                <span className="bg-[#f3f2ee] text-[#57534e] rounded-full px-2 py-0.5 text-[10px]">
                  {extractDomain(paper.url)}
                </span>
              )}
              {paper.citationCount > 0 && (
                <span className="text-[10px] text-[#78716c]">
                  {formatCount(paper.citationCount)} cited
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={(e) => {
                e.stopPropagation();
                onAdd(paper);
              }}
            >
              <Plus className="w-3.5 h-3.5 text-[#7c3aed]" />
            </Button>
            {paper.url && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(paper.url, "_blank");
                }}
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#78716c]" />
              </Button>
            )}
          </div>
        </div>
      ))}

      <div className="px-3 py-2 border-t border-[#e8e7e2] mt-2">
        <Button variant="default" size="sm" className="w-full" onClick={onAddAll}>
          Add all {results.length} papers to graph
        </Button>
      </div>
    </div>
  );
}
