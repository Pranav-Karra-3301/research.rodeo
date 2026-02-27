"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn, formatAuthors, formatCount, truncate } from "@/lib/utils";
import type { GraphNodeData } from "@/types";

type FrontierNodeType = Node<GraphNodeData, "frontier">;

const HANDLE_CLASS =
  "!bg-zinc-500 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity";

function FrontierNodeInner({ data }: NodeProps<FrontierNodeType>) {
  const { paper, scores, onSelect, onMaterialize, recencyColor, dimensions, fadeOpacity } = data;

  const width = dimensions?.width ?? 200;
  // Higher base opacity so frontier nodes are readable
  const opacity = fadeOpacity != null ? Math.max(fadeOpacity, 0.5) : 0.7;

  const authorLine = formatAuthors(paper.authors, 2);
  const abstractSnippet = paper.tldr ?? paper.abstract;

  return (
    <div className="relative group" style={{ opacity }} onClick={onSelect}>
      <Handle type="target" position={Position.Top} id="top" className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={HANDLE_CLASS} />
      <Handle type="target" position={Position.Left} id="left-target" className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Left} id="left-source" className={HANDLE_CLASS} />
      <Handle type="target" position={Position.Right} id="right-target" className={HANDLE_CLASS} />
      <Handle type="source" position={Position.Right} id="right-source" className={HANDLE_CLASS} />

      <div
        className={cn(
          "rounded-lg border border-dashed border-[#c8c7c2]",
          "p-2.5 transition-all duration-300 cursor-pointer",
          "hover:border-[#7c3aed]/40 hover:shadow-md hover:shadow-violet-500/5"
        )}
        style={{
          width,
          backgroundColor: recencyColor ? `color-mix(in srgb, ${recencyColor} 12%, #f8f7f4)` : "#f8f7f4",
        }}
      >
        {/* Citation count badge */}
        {paper.citationCount > 0 && (
          <div className="absolute -top-1.5 -right-1.5 bg-[#f3f2ee] border border-dashed border-[#c8c7c2] rounded-full px-1.5 py-0.5 text-[8px] text-[#78716c] leading-none">
            {formatCount(paper.citationCount)}
          </div>
        )}

        {/* Frontier badge */}
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-[8px] uppercase tracking-wider font-medium text-[#7c3aed]/70 bg-[#7c3aed]/8 rounded px-1 py-0.5 leading-none">
            Frontier
          </span>
          {paper.year && (
            <span className="text-[9px] text-[#78716c]">{paper.year}</span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-medium text-[11px] text-[#44403c] leading-tight line-clamp-2 mb-1">
          {paper.title}
        </h3>

        {/* Authors */}
        {authorLine && (
          <p className="text-[9px] text-[#78716c] truncate mb-1">{authorLine}</p>
        )}

        {/* Abstract snippet */}
        {abstractSnippet && (
          <p className="text-[8px] text-[#a8a29e] line-clamp-2 mb-1.5 leading-relaxed">
            {truncate(abstractSnippet, 120)}
          </p>
        )}

        {/* Relevance bar */}
        {scores.relevance > 0 && (
          <div className="h-[2px] bg-[#e8e7e2] rounded-full overflow-hidden mb-1.5">
            <div
              className="h-full bg-violet-400/50 rounded-full"
              style={{ width: `${Math.round(scores.relevance * 100)}%` }}
            />
          </div>
        )}

        {/* Materialize button — always visible, more prominent on hover */}
        <button
          type="button"
          className={cn(
            "flex items-center justify-center gap-1 w-full py-1 rounded-md text-[10px] font-medium transition-all",
            "bg-[#7c3aed]/8 text-[#7c3aed]/70",
            "hover:bg-[#7c3aed] hover:text-white",
            "group-hover:bg-[#7c3aed]/15"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onMaterialize?.();
          }}
        >
          <Plus className="w-3 h-3" />
          Materialize
        </button>
      </div>
    </div>
  );
}

export const FrontierNode = memo(FrontierNodeInner);
