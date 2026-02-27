"use client";

import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { SearchBar } from "@/components/search/SearchBar";
import { useUIStore } from "@/store/ui-store";
import { useGraphStore } from "@/store/graph-store";
import { executeGraphCommand } from "@/lib/graph/commands";
import { Search, LayoutGrid } from "lucide-react";

export function AppShell() {
  const toggleSearch = useUIStore((s) => s.toggleSearch);
  const nodeCount = useGraphStore((s) => s.nodes.size);
  const edgeCount = useGraphStore((s) => s.edges.length);

  return (
    <div className="w-screen h-screen flex flex-col overflow-hidden bg-[#f8f7f4]">
      {/* Top bar */}
      <div className="h-12 border-b border-[#e8e7e2] bg-white flex items-center px-4 gap-3 shrink-0">
        <span className="text-sm font-semibold text-[#1c1917]">Rabbit Hole</span>
        <div className="flex-1" />

        {/* Stats */}
        <span className="text-[10px] text-[#a8a29e]">
          {nodeCount} nodes &middot; {edgeCount} edges
        </span>

        {/* Search trigger */}
        <button
          onClick={toggleSearch}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-[#78716c] bg-[#f3f2ee] hover:bg-[#eeeee8] rounded-lg border border-[#e8e7e2] transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          Search
          <kbd className="text-[9px] text-[#a8a29e] ml-1">&#8984;K</kbd>
        </button>

        {/* Relayout button */}
        <button
          onClick={() => {
            void executeGraphCommand({ type: "relayout", source: "canvas" });
          }}
          className="p-1.5 text-[#78716c] hover:text-[#1c1917] hover:bg-[#f3f2ee] rounded-lg transition-colors"
          title="Auto-layout"
        >
          <LayoutGrid className="w-4 h-4" />
        </button>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 relative">
        <GraphCanvas />
      </div>

      {/* Search modal */}
      <SearchBar />
    </div>
  );
}
