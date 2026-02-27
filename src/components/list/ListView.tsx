"use client";

import { useState, useMemo, useCallback } from "react";
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useGraphStore } from "@/store/graph-store";
import { useUIStore } from "@/store/ui-store";
import { cn, formatCount } from "@/lib/utils";
import { CLUSTER_COLORS } from "@/lib/design-tokens";
import type { PaperNode } from "@/types";

type SortKey = "title" | "year" | "citations" | "relevance";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: "title", label: "Title", className: "flex-1 min-w-0" },
  { key: "year", label: "Year", className: "w-16 text-right" },
  { key: "citations", label: "Citations", className: "w-20 text-right" },
  { key: "relevance", label: "Relevance", className: "w-20 text-right" },
];

export function ListView() {
  const nodes = useGraphStore((s) => s.nodes);
  const clusters = useGraphStore((s) => s.clusters);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectNode = useGraphStore((s) => s.selectNode);
  const setRightPanel = useUIStore((s) => s.setRightPanel);

  const [searchFilter, setSearchFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("relevance");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [activeClusterId, setActiveClusterId] = useState<string | null>(null);

  const allPapers = useMemo(() => {
    return Array.from(nodes.values()).filter(
      (n) => n.state === "materialized" || n.state === "enriched"
    );
  }, [nodes]);

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

  const sortedPapers = useMemo(() => {
    const sorted = [...filteredPapers];
    const dir = sortDir === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sortKey) {
        case "title":
          return dir * a.data.title.localeCompare(b.data.title);
        case "year":
          return dir * ((a.data.year ?? 0) - (b.data.year ?? 0));
        case "citations":
          return dir * (a.data.citationCount - b.data.citationCount);
        case "relevance":
          return dir * (a.scores.relevance - b.scores.relevance);
        default:
          return 0;
      }
    });

    return sorted;
  }, [filteredPapers, sortKey, sortDir]);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const handleSelectPaper = useCallback(
    (paperId: string) => {
      selectNode(paperId);
      setRightPanel("reader");
    },
    [selectNode, setRightPanel]
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Search + cluster chips */}
      <div className="px-4 py-3 border-b border-[#e8e7e2] space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716c]" />
          <Input
            placeholder="Filter papers..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="h-9 pl-10 text-sm bg-[#f3f2ee] border-[#dddcd7]"
          />
        </div>

        {clusters.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveClusterId(null)}
              className={cn(
                "px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
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
                  "px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors border",
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
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#e8e7e2] bg-[#fafaf8]">
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => handleSort(col.key)}
            className={cn(
              "flex items-center gap-1 text-[11px] font-medium transition-colors",
              col.className,
              sortKey === col.key ? "text-[#1c1917]" : "text-[#78716c] hover:text-[#44403c]"
            )}
          >
            {col.label}
            {sortKey === col.key ? (
              sortDir === "asc" ? (
                <ArrowUp className="w-3 h-3" />
              ) : (
                <ArrowDown className="w-3 h-3" />
              )
            ) : (
              <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
            )}
          </button>
        ))}
        <div className="w-24 text-[11px] font-medium text-[#78716c]">Cluster</div>
      </div>

      {/* Rows */}
      <ScrollArea className="flex-1">
        {sortedPapers.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-[#a8a29e]">
            No papers found
          </div>
        ) : (
          <div>
            {sortedPapers.map((paper) => (
              <PaperRow
                key={paper.id}
                paper={paper}
                clusters={clusters}
                isSelected={paper.id === selectedNodeId}
                onSelect={handleSelectPaper}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer count */}
      <div className="px-4 py-1.5 border-t border-[#e8e7e2] text-[11px] text-[#a8a29e]">
        {sortedPapers.length} of {allPapers.length} papers
      </div>
    </div>
  );
}

function PaperRow({
  paper,
  clusters,
  isSelected,
  onSelect,
}: {
  paper: PaperNode;
  clusters: { id: string; label: string; color: string }[];
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  const firstAuthor = paper.data.authors[0]?.name ?? "Unknown";
  const cluster = clusters.find((c) => c.id === paper.clusterId);

  return (
    <button
      onClick={() => onSelect(paper.id)}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-[#e8e7e2]/50",
        "hover:bg-[#f3f2ee]/60",
        isSelected && "bg-[#ede9fe]/40"
      )}
    >
      {/* Title + Author */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#1c1917] line-clamp-1 leading-tight">
          {paper.data.title}
        </p>
        <p className="text-[11px] text-[#78716c] truncate mt-0.5">{firstAuthor}</p>
      </div>

      {/* Year */}
      <div className="w-16 text-right text-[12px] text-[#57534e] tabular-nums">
        {paper.data.year ?? "—"}
      </div>

      {/* Citations */}
      <div className="w-20 text-right text-[12px] text-[#57534e] tabular-nums">
        {formatCount(paper.data.citationCount)}
      </div>

      {/* Relevance */}
      <div className="w-20 text-right">
        <RelevanceBar value={paper.scores.relevance} />
      </div>

      {/* Cluster */}
      <div className="w-24">
        {cluster && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 border-0"
            style={{
              backgroundColor: `${cluster.color}18`,
              color: cluster.color,
            }}
          >
            {cluster.label}
          </Badge>
        )}
      </div>
    </button>
  );
}

function RelevanceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 rounded-full bg-[#e8e7e2] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#8b5cf6] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-[#78716c] tabular-nums w-6">{pct}%</span>
    </div>
  );
}
