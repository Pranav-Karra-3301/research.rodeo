"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Compass, FileText, History, Loader2, Quote, Swords } from "lucide-react";
import { cn, formatAuthors, formatCount } from "@/lib/utils";
import { CLUSTER_COLORS } from "@/lib/design-tokens";
import type { GraphNodeData, ExpansionMode } from "@/types";

type PaperNodeType = Node<GraphNodeData, "paper">;

const EXPANSION_OPTIONS: { mode: ExpansionMode; label: string; Icon: typeof Compass }[] = [
  { mode: "foundational", label: "Foundational", Icon: Quote },
  { mode: "recent", label: "Recent", Icon: History },
  { mode: "contrasting", label: "Contrasting", Icon: Swords },
];

/** Map citation count to node width (188px min, 286px max) */
function nodeWidth(citationCount: number): number {
  if (citationCount <= 0) return 188;
  const log = Math.log10(citationCount + 1);
  const t = Math.min(log / 4, 1);
  return Math.round(188 + t * 98);
}

function clusterColor(clusterId: string | undefined): string | undefined {
  if (!clusterId) return undefined;
  // Deterministic color from cluster ID
  let hash = 0;
  for (let i = 0; i < clusterId.length; i++) {
    hash = (hash * 31 + clusterId.charCodeAt(i)) | 0;
  }
  return CLUSTER_COLORS[Math.abs(hash) % CLUSTER_COLORS.length];
}

function PaperNodeCardInner({ data }: NodeProps<PaperNodeType>) {
  const [showExpand, setShowExpand] = useState(false);
  const { paper, state, scores, clusterId, isSelected, isMultiSelected, isExpanding, onExpand, onSelect } = data;

  if (state === "archived") return null;

  const width = nodeWidth(paper.citationCount);
  const borderColor = clusterColor(clusterId);
  const authorLine = formatAuthors(paper.authors, 1);

  return (
    <div
      className={cn("relative group", isExpanding && "animate-pulse")}
      onClick={onSelect}
      style={{ width }}
    >
      {/* Handles – top, bottom, left, right; visible on hover */}
      <Handle
        type="target"
        position={Position.Top}
        id="top"
        className="!bg-violet-500 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bottom"
        className="!bg-violet-500 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left-target"
        className="!bg-violet-500 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="left-source"
        className="!bg-violet-500 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="right-target"
        className="!bg-violet-500 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="right-source"
        className="!bg-violet-500 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity"
      />

      {/* Card body */}
      <div
        className={cn(
          "rounded-lg border bg-white p-2 transition-all duration-200",
          "hover:scale-[1.02] hover:brightness-100 hover:shadow-lg hover:shadow-violet-500/5",
          "border-[#dddcd7]",
          isSelected && "ring-2 ring-violet-500/50 shadow-lg shadow-violet-500/10 border-violet-500/40",
          isMultiSelected && "ring-2 ring-blue-500/60 shadow-lg shadow-blue-500/10 border-blue-500/40"
        )}
        style={{
          borderLeftWidth: 3,
          borderLeftColor: borderColor ?? "#c8c7c2",
        }}
      >
        {/* Thumbnail strip: og:image > favicon fallback > generic icon */}
        {paper.ogImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={paper.ogImage}
            alt=""
            className="w-full h-10 mb-1.5 rounded-md object-cover border border-[#e8e7e2]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="flex items-center justify-center h-9 mb-1.5 rounded-md bg-violet-500/[0.07] border border-violet-500/15 gap-1">
            {paper.faviconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={paper.faviconUrl}
                alt=""
                className="w-3.5 h-3.5 rounded-sm"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <FileText className="w-4 h-4 text-violet-500/70" aria-hidden />
          </div>
        )}

        {/* Citation count badge */}
        <div className="absolute -top-1.5 -right-1.5 bg-[#f3f2ee] border border-[#dddcd7] rounded-full px-1.5 py-0.5 text-[9px] text-[#57534e] leading-none">
          {formatCount(paper.citationCount)}
        </div>

        {/* Title */}
        <h3 className="font-paper-title text-[12px] text-[#1c1917] leading-tight line-clamp-2 mb-0.5">
          {paper.title}
        </h3>

        {/* Author / Site */}
        <p className="text-[9px] text-[#57534e] truncate">
          {paper.isUrlSource
            ? (paper.siteName ?? new URL(paper.url ?? "https://unknown").hostname.replace(/^www\./, ""))
            : `${authorLine}${paper.year ? `, ${paper.year}` : ""}`}
        </p>

        {/* Expand + Relevance row */}
        <div className="mt-1 flex items-center gap-1.5 relative">
          {state !== "discovered" && (
            <>
              {isExpanding ? (
                <span className="flex items-center gap-0.5 text-[10px] text-[#7c3aed] shrink-0">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Expanding
                </span>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowExpand(!showExpand);
                  }}
                  className={cn(
                    "flex items-center gap-0.5 text-[10px] text-[#78716c] shrink-0",
                    "hover:text-[#7c3aed] transition-colors",
                    "opacity-0 group-hover:opacity-100"
                  )}
                >
                  <Compass className="w-2.5 h-2.5" />
                  Expand
                </button>
              )}
              {showExpand && !isExpanding && (
                <div className="absolute left-0 top-full mt-0.5 z-50 bg-white border border-[#e8e7e2] rounded-lg py-1 shadow-xl shadow-black/8 min-w-[120px]">
                  {EXPANSION_OPTIONS.map(({ mode, label, Icon }) => (
                    <button
                      key={mode}
                      onClick={(e) => {
                        e.stopPropagation();
                        onExpand?.(mode);
                        setShowExpand(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-[10px] text-[#44403c] hover:bg-[#f3f2ee] hover:text-[#1c1917] transition-colors"
                    >
                      <Icon className="w-3 h-3" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="flex-1 min-w-0 h-[2px] bg-[#e8e7e2] rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500/60 rounded-full transition-all duration-500"
              style={{ width: `${Math.round(scores.relevance * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const PaperNodeCard = memo(PaperNodeCardInner);
