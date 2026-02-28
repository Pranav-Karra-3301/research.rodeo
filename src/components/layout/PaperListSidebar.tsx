"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Button } from "@/components/ui/Button";
import { RabbitHoleBrowser } from "@/components/rabbit-holes/RabbitHoleBrowser";
import { useGraphStore } from "@/store/graph-store";
import { useUIStore } from "@/store/ui-store";
import { cn, formatAuthors, formatCount } from "@/lib/utils";
import { layout, animation, CLUSTER_COLORS } from "@/lib/design-tokens";
import type { PaperNode } from "@/types";

type SortKey = "relevance" | "citations" | "year";

export function PaperListSidebar() {
  const nodes = useGraphStore((s) => s.nodes);
  const clusters = useGraphStore((s) => s.clusters);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  const [searchFilter, setSearchFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("relevance");
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);

  // Get all materialized/enriched papers
  const allPapers = useMemo(() => {
    return Array.from(nodes.values()).filter(
      (n) => n.state === "materialized" || n.state === "enriched"
    );
  }, [nodes]);

  // Filter by search text and cluster
  const filteredPapers = useMemo(() => {
    let papers = allPapers;

    if (activeClusterId) {
      papers = papers.filter((p) => p.clusterId === activeClusterId);
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      papers = papers.filter(
        (p) =>
          p.data.title.toLowerCase().includes(q) ||
          p.data.authors.some((a) => a.name.toLowerCase().includes(q))
      );
    }

    return papers;
  }, [allPapers, searchFilter, activeClusterId]);

  // Sort
  const sortedPapers = useMemo(() => {
    const sorted = [...filteredPapers];
    switch (sortKey) {
      case "relevance":
        sorted.sort((a, b) => b.scores.relevance - a.scores.relevance);
        break;
      case "citations":
        sorted.sort((a, b) => b.data.citationCount - a.data.citationCount);
        break;
      case "year":
        sorted.sort((a, b) => (b.data.year ?? 0) - (a.data.year ?? 0));
        break;
    }
    return sorted;
  }, [filteredPapers, sortKey]);

  const cycleSortKey = useCallback(() => {
    const keys: SortKey[] = ["relevance", "citations", "year"];
    const idx = keys.indexOf(sortKey);
    setSortKey(keys[(idx + 1) % keys.length]);
  }, [sortKey]);

  const handleSelectPaper = useCallback(
    (paperId: string) => {
      selectNode(paperId);
      setRightPanel("reader");
    },
    [selectNode, setRightPanel]
  );

  return (
    <div
      className="flex flex-col h-full bg-white shadow-[4px_0_12px_rgba(0,0,0,0.04)]"
      style={{ width: layout.sidebar.width }}
    >
      {/* Rabbit hole browser */}
      <RabbitHoleBrowser />

      {/* Search input */}
      <div className="p-2 border-b border-[#e8e7e2]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#78716c]" />
          <Input
            placeholder="Filter papers..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="h-8 pl-8 text-xs bg-[#f3f2ee] border-[#dddcd7]"
          />
        </div>
      </div>

      {/* Sort */}
      <div className="flex items-center justify-end px-2 py-1.5 border-b border-[#e8e7e2]">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={cycleSortKey}
          title={`Sort: ${sortKey}`}
        >
          <ArrowUpDown className="w-3 h-3 text-[#78716c]" />
        </Button>
      </div>

      {/* Cluster filter chips */}
      {clusters.length > 0 && (
        <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-[#e8e7e2]">
          <button
            onClick={() => setActiveClusterId(null)}
            className={cn(
              "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors",
              !activeClusterId
                ? "bg-[#eeeee8] text-[#1c1917]"
                : "bg-[#f3f2ee] text-[#78716c] hover:text-[#44403c]"
            )}
          >
            All
          </button>
          {clusters.map((cluster, i) => (
            <button
              key={cluster.id}
              onClick={() =>
                setActiveClusterId(
                  activeClusterId === cluster.id ? null : cluster.id
                )
              }
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors border",
                activeClusterId === cluster.id
                  ? "text-[#1c1917]"
                  : "text-[#57534e] hover:text-[#1c1917]"
              )}
              style={{
                borderColor:
                  activeClusterId === cluster.id
                    ? cluster.color || CLUSTER_COLORS[i % CLUSTER_COLORS.length]
                    : "transparent",
                backgroundColor:
                  activeClusterId === cluster.id
                    ? `${cluster.color || CLUSTER_COLORS[i % CLUSTER_COLORS.length]}20`
                    : undefined,
              }}
            >
              {cluster.label}
            </button>
          ))}
        </div>
      )}

      {/* Sort indicator */}
      <div className="px-2 py-1 border-b border-[#e8e7e2]/50">
        <span className="text-[10px] text-[#a8a29e]">
          {sortedPapers.length} papers -- sorted by {sortKey}
        </span>
      </div>

      {/* Paper list with bottom animation overlay */}
      <div className="relative flex-1 min-h-0 flex flex-col">
        <ScrollArea className="flex-1">
          <div className="p-1 pb-24">
            {sortedPapers.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-xs text-[#a8a29e]">
                No papers found
              </div>
            ) : (
              sortedPapers.map((paper) => (
                <PaperRow
                  key={paper.id}
                  paper={paper}
                  isSelected={paper.id === selectedNodeId}
                  onSelect={handleSelectPaper}
                />
              ))
            )}
          </div>
        </ScrollArea>

        {/* Overlay: gradient fade then animation (transparent video doesn’t overlap text sharply) */}
        <SidebarFooterAnimation />
      </div>
    </div>
  );
}

function PaperRow({
  paper,
  isSelected,
  onSelect,
}: {
  paper: PaperNode;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const firstAuthor = paper.data.authors[0]?.name ?? "Unknown";
  const year = paper.data.year;
  const citations = paper.data.citationCount;

  return (
    <motion.button
      onClick={() => onSelect(paper.id)}
      className={cn(
        "w-full text-left px-2.5 py-2 rounded-lg transition-colors group",
        "hover:bg-[#f3f2ee]/60",
        isSelected && "bg-[#f3f2ee]/80 border-l-2 border-[#7c3aed]"
      )}
      initial={false}
      animate={{
        backgroundColor: isSelected ? "rgba(243, 242, 238, 0.8)" : "transparent",
      }}
      transition={animation.fast}
    >
      {/* Title */}
      <h4 className="font-paper-title text-[13px] leading-tight text-[#1c1917] line-clamp-2 group-hover:text-[#1c1917]">
        {paper.data.title}
      </h4>

      {/* Meta row */}
      <div className="flex items-center gap-2 mt-1 text-[11px] text-[#78716c]">
        <span className="truncate max-w-[140px]">{firstAuthor}</span>
        {year && <span>{year}</span>}
        {citations > 0 && (
          <span className="ml-auto text-[#a8a29e]">{formatCount(citations)} cited</span>
        )}
      </div>

      {/* Cluster badge */}
      {paper.clusterId && (
        <div className="mt-1">
          <ClusterDot clusterId={paper.clusterId} />
        </div>
      )}
    </motion.button>
  );
}

function ClusterDot({ clusterId }: { clusterId: string }) {
  const clusters = useGraphStore((s) => s.clusters);
  const cluster = clusters.find((c) => c.id === clusterId);
  if (!cluster) return null;

  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full"
      style={{ backgroundColor: cluster.color }}
    />
  );
}

/** Experimental: animated webm at bottom of sidebar; each hover plays once to the end then stops on last frame. Overlays list with a gradient so transparent video doesn’t cut across text. */
function SidebarFooterAnimation() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleMouseEnter = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    video.play().catch(() => {});
  }, []);

  const handleEnded = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  return (
    <div
      className="absolute bottom-0 left-0 right-0 flex flex-col pointer-events-none"
      aria-hidden
    >
      {/* Fade list content out so it doesn’t show through the transparent video */}
      <div
        className="h-14 w-full flex-shrink-0 bg-gradient-to-b from-transparent to-white"
        style={{ minHeight: "3.5rem" }}
      />
      <div
        className="pointer-events-auto flex items-center justify-center py-1.5 px-1 bg-white"
        onMouseEnter={handleMouseEnter}
      >
        <video
          ref={videoRef}
          src="/animation.webm"
          className="w-full max-w-full max-h-40 h-auto object-contain pointer-events-none"
          muted
          playsInline
          preload="metadata"
          onEnded={handleEnded}
        />
      </div>
    </div>
  );
}
