"use client";

import { FileText } from "lucide-react";
import { useGraphStore } from "@/store/graph-store";
import { useUIStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";

interface CitationBadgeProps {
  paperId: string;
  title: string;
  year?: number;
  className?: string;
}

export function CitationBadge({
  paperId,
  title,
  year,
  className,
}: CitationBadgeProps) {
  const selectNode = useGraphStore((s) => s.selectNode);
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  const shortTitle =
    title.length > 35 ? title.slice(0, 32) + "..." : title;
  const label = year ? `${shortTitle}, ${year}` : shortTitle;

  const handleClick = () => {
    selectNode?.(paperId);
    setRightPanel("reader");
  };

  return (
    <button
      onClick={handleClick}
      title={`${title}${year ? ` (${year})` : ""}\nClick to view in reader`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        "bg-[#ecebe6] text-[#44403c] hover:bg-[#e3e1dc]",
        "border border-[#dddcd7] hover:border-[#c8c7c2]",
        "transition-colors cursor-pointer align-baseline",
        className
      )}
    >
      <FileText className="h-3 w-3 flex-shrink-0" />
      [{label}]
    </button>
  );
}
