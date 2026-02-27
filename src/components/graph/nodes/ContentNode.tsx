"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Compass, FileText, History, Loader2, Quote, Swords } from "lucide-react";
import { cn, formatAuthors, formatCount, truncate } from "@/lib/utils";
import { CLUSTER_COLORS } from "@/lib/design-tokens";
import type { GraphNodeData, ExpansionMode } from "@/types";
import type { ZoomLevel } from "@/lib/visual/zoom-levels";

type ContentNodeType = Node<GraphNodeData, "paper">;

const EXPANSION_OPTIONS: { mode: ExpansionMode; label: string; Icon: typeof Compass }[] = [
  { mode: "foundational", label: "Foundational", Icon: Quote },
  { mode: "recent", label: "Recent", Icon: History },
  { mode: "contrasting", label: "Contrasting", Icon: Swords },
];

function clusterColor(clusterId: string | undefined): string | undefined {
  if (!clusterId) return undefined;
  let hash = 0;
  for (let i = 0; i < clusterId.length; i++) {
    hash = (hash * 31 + clusterId.charCodeAt(i)) | 0;
  }
  return CLUSTER_COLORS[Math.abs(hash) % CLUSTER_COLORS.length];
}

const HANDLE_CLASS =
  "!w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity";

function ContentNodeInner({ data }: NodeProps<ContentNodeType>) {
  const [showExpand, setShowExpand] = useState(false);

  const {
    paper,
    state,
    scores,
    clusterId,
    isSelected,
    isMultiSelected,
    isExpanding,
    recencyColor,
    dimensions,
    fadeOpacity,
    onExpand,
    onSelect,
  } = data;

  // Read zoom level from data or default to "medium"
  const zoomLevel: ZoomLevel = (data.zoomLevel as ZoomLevel) ?? "medium";

  if (state === "archived") return null;

  const width = dimensions?.width ?? 220;
  const height = dimensions?.height ?? 100;
  const fontScale = dimensions?.fontScale ?? 1;
  const opacity = fadeOpacity ?? 1;
  const borderColor = clusterColor(clusterId);
  const authorLine = formatAuthors(paper.authors, 1);

  // --- Cluster zoom: just a colored dot ---
  if (zoomLevel === "cluster") {
    return (
      <div
        style={{ opacity }}
        onClick={onSelect}
        className="relative group flex items-center justify-center"
      >
        <Handle type="target" position={Position.Top} id="top" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="source" position={Position.Bottom} id="bottom" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="target" position={Position.Left} id="left-target" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="source" position={Position.Right} id="right-source" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <div
          className={cn(
            "w-4 h-4 rounded-full border-2",
            isSelected && "ring-2 ring-indigo-500"
          )}
          style={{ backgroundColor: recencyColor ?? borderColor ?? "#94a3b8", borderColor: borderColor ?? "#94a3b8" }}
          title={paper.title}
        />
      </div>
    );
  }

  // --- Overview zoom: title only ---
  if (zoomLevel === "overview") {
    return (
      <div
        className="relative group"
        style={{ width, opacity }}
        onClick={onSelect}
      >
        <Handle type="target" position={Position.Top} id="top" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="source" position={Position.Bottom} id="bottom" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="target" position={Position.Left} id="left-target" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="source" position={Position.Right} id="right-source" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <div
          className={cn(
            "rounded-md border p-1.5 transition-all duration-200",
            "border-[#dddcd7]",
            isSelected && "ring-2 ring-indigo-500 shadow-md border-indigo-400",
            isMultiSelected && "ring-2 ring-blue-500/60"
          )}
          style={{
            backgroundColor: recencyColor ?? "#f8f7f4",
            borderLeftWidth: 3,
            borderLeftColor: borderColor ?? "#c8c7c2",
          }}
        >
          <h3
            className="font-medium text-[11px] text-[#1c1917] leading-tight line-clamp-2"
            style={{ fontSize: `${11 * fontScale}px` }}
          >
            {paper.title}
          </h3>
        </div>
      </div>
    );
  }

  // --- Detail zoom: full card ---
  if (zoomLevel === "detail") {
    return (
      <div
        className={cn("relative group", isExpanding && "animate-pulse")}
        style={{ width, opacity }}
        onClick={onSelect}
      >
        <Handle type="target" position={Position.Top} id="top" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="source" position={Position.Bottom} id="bottom" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="target" position={Position.Left} id="left-target" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="source" position={Position.Left} id="left-source" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="target" position={Position.Right} id="right-target" className={cn("!bg-violet-500", HANDLE_CLASS)} />
        <Handle type="source" position={Position.Right} id="right-source" className={cn("!bg-violet-500", HANDLE_CLASS)} />

        <div
          className={cn(
            "rounded-lg border bg-white p-2 transition-all duration-200",
            "hover:shadow-lg hover:shadow-violet-500/5",
            "border-[#dddcd7]",
            isSelected && "ring-2 ring-indigo-500 shadow-lg shadow-indigo-500/10 border-indigo-400",
            isMultiSelected && "ring-2 ring-blue-500/60 shadow-lg shadow-blue-500/10 border-blue-500/40"
          )}
          style={{
            borderLeftWidth: 3,
            borderLeftColor: borderColor ?? "#c8c7c2",
            backgroundColor: recencyColor ? `color-mix(in srgb, ${recencyColor} 8%, white)` : "white",
          }}
        >
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

          <div className="absolute -top-1.5 -right-1.5 bg-[#f3f2ee] border border-[#dddcd7] rounded-full px-1.5 py-0.5 text-[9px] text-[#57534e] leading-none">
            {formatCount(paper.citationCount)}
          </div>

          <h3
            className="font-medium text-[12px] text-[#1c1917] leading-tight line-clamp-2 mb-0.5"
            style={{ fontSize: `${12 * fontScale}px` }}
          >
            {paper.title}
          </h3>

          <p className="text-[9px] text-[#57534e] truncate mb-1">
            {paper.isUrlSource
              ? (paper.siteName ?? new URL(paper.url ?? "https://unknown").hostname.replace(/^www\./, ""))
              : `${authorLine}${paper.year ? `, ${paper.year}` : ""}`}
          </p>

          {(paper.abstract || paper.tldr) && (
            <p className="text-[9px] text-[#78716c] line-clamp-3 mb-1">
              {truncate(paper.tldr ?? paper.abstract ?? "", 200)}
            </p>
          )}

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

  // --- Medium zoom (default): title + authors + year + citation badge + relevance bar ---
  return (
    <div
      className={cn("relative group", isExpanding && "animate-pulse")}
      style={{ width, opacity }}
      onClick={onSelect}
    >
      <Handle type="target" position={Position.Top} id="top" className={cn("!bg-violet-500", HANDLE_CLASS)} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={cn("!bg-violet-500", HANDLE_CLASS)} />
      <Handle type="target" position={Position.Left} id="left-target" className={cn("!bg-violet-500", HANDLE_CLASS)} />
      <Handle type="source" position={Position.Left} id="left-source" className={cn("!bg-violet-500", HANDLE_CLASS)} />
      <Handle type="target" position={Position.Right} id="right-target" className={cn("!bg-violet-500", HANDLE_CLASS)} />
      <Handle type="source" position={Position.Right} id="right-source" className={cn("!bg-violet-500", HANDLE_CLASS)} />

      <div
        className={cn(
          "rounded-lg border bg-white p-2 transition-all duration-200",
          "hover:scale-[1.02] hover:shadow-lg hover:shadow-violet-500/5",
          "border-[#dddcd7]",
          isSelected && "ring-2 ring-indigo-500 shadow-lg shadow-indigo-500/10 border-indigo-400",
          isMultiSelected && "ring-2 ring-blue-500/60 shadow-lg shadow-blue-500/10 border-blue-500/40"
        )}
        style={{
          borderLeftWidth: 3,
          borderLeftColor: borderColor ?? "#c8c7c2",
          backgroundColor: recencyColor ? `color-mix(in srgb, ${recencyColor} 8%, white)` : "white",
          minHeight: height,
        }}
      >
        <div className="absolute -top-1.5 -right-1.5 bg-[#f3f2ee] border border-[#dddcd7] rounded-full px-1.5 py-0.5 text-[9px] text-[#57534e] leading-none">
          {formatCount(paper.citationCount)}
        </div>

        <h3
          className="font-medium text-[12px] text-[#1c1917] leading-tight line-clamp-2 mb-0.5"
          style={{ fontSize: `${12 * fontScale}px` }}
        >
          {paper.title}
        </h3>

        <p className="text-[9px] text-[#57534e] truncate mb-1">
          {paper.isUrlSource
            ? (paper.siteName ?? new URL(paper.url ?? "https://unknown").hostname.replace(/^www\./, ""))
            : `${authorLine}${paper.year ? `, ${paper.year}` : ""}`}
        </p>

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

export const ContentNode = memo(ContentNodeInner);
