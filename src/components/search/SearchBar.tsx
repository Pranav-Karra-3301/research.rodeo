"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Loader2, Globe, MapPin } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useUIStore } from "@/store/ui-store";
import { useGraphStore } from "@/store/graph-store";
import { executeGraphCommand } from "@/lib/graph/commands";
import { cn } from "@/lib/utils";
import { searchWithinGraph, type SearchHit } from "@/lib/graph/search";
import type { PaperMetadata } from "@/types";

type SearchMode = "auto" | "instant" | "deep";

const MODE_OPTIONS: { value: SearchMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "instant", label: "Instant" },
  { value: "deep", label: "Deep" },
];

export function SearchBar() {
  const searchOpen = useUIStore((s) => s.searchOpen);
  const toggleSearch = useUIStore((s) => s.toggleSearch);
  const setQuery = useGraphStore((s) => s.setQuery);
  const setLoading = useGraphStore((s) => s.setLoading);
  const graphNodes = useGraphStore((s) => s.nodes);
  const selectNode = useGraphStore((s) => s.selectNode);

  const [inputValue, setInputValue] = useState("");
  const [searchScope, setSearchScope] = useState<"web" | "local">("web");
  const [searchMode, setSearchMode] = useState<SearchMode>("auto");
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PaperMetadata[]>([]);
  const [localResults, setLocalResults] = useState<SearchHit[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setError(null);
      setResults([]);
      setLocalResults([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setInputValue("");
      setError(null);
      setResults([]);
      setLocalResults([]);
    }
  }, [searchOpen]);

  // Live local search
  useEffect(() => {
    if (searchScope !== "local") return;
    const query = inputValue.trim();
    if (!query || query.length < 2) { setLocalResults([]); return; }
    const timer = setTimeout(() => {
      const hits = searchWithinGraph(query, graphNodes, 20);
      setLocalResults(hits);
      setError(hits.length === 0 && query.length > 2 ? "No matches found." : null);
    }, 150);
    return () => clearTimeout(timer);
  }, [inputValue, searchScope, graphNodes]);

  const handleSearch = useCallback(async () => {
    if (searchScope === "local") return;
    const query = inputValue.trim();
    if (!query || isSearching) return;

    setError(null);
    setIsSearching(true);
    setResults([]);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query, searchMode }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? `Search failed (${res.status})`); return; }
      if (data.status !== "success" || !data.data?.papers?.length) {
        setError("No papers found. Try a different query.");
        return;
      }
      setResults(data.data.papers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [inputValue, isSearching, searchMode, searchScope]);

  const addToGraph = useCallback(async (paper: PaperMetadata) => {
    setLoading(true);
    try {
      const result = await executeGraphCommand({
        type: "add-node",
        paper,
        materialize: true,
        source: "canvas",
      });
      if (!result.applied) {
        setError(result.error ?? "Failed to add source");
      }
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  const addAllToGraph = useCallback(async () => {
    if (results.length === 0) return;
    setLoading(true);
    try {
      setQuery(inputValue.trim());
      for (const paper of results) {
        await executeGraphCommand({ type: "add-node", paper, materialize: true, source: "canvas" });
      }
      toggleSearch();
    } finally {
      setLoading(false);
    }
  }, [results, inputValue, setQuery, setLoading, toggleSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length === 0 && localResults.length === 0) handleSearch();
    if (e.key === "Escape") toggleSearch();
  };

  if (!searchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/20" onClick={toggleSearch} />
      <div className="relative w-full max-w-[640px] bg-white rounded-xl border border-[#dddcd7] shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center border-b border-[#e8e7e2] px-4 focus-within:bg-violet-50/30">
          <Search className="w-5 h-5 text-[#78716c] shrink-0" />
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search papers, topics, or questions..."
            className="flex-1 bg-transparent border-0 px-3 py-4 text-sm text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none"
          />
          {inputValue && (
            <button onClick={() => setInputValue("")} className="text-[#78716c] hover:text-[#44403c]">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Scope & mode toggles */}
        <div className="px-4 py-2 flex flex-wrap items-center gap-2 border-b border-[#e8e7e2]/50">
          <button
            onClick={() => { setSearchScope("web"); setLocalResults([]); setResults([]); setError(null); }}
            className={cn(
              "rounded-full px-3 py-1 text-xs transition-colors flex items-center gap-1",
              searchScope === "web" ? "bg-violet-600 text-white" : "bg-[#f3f2ee] text-[#44403c] hover:bg-[#eeeee8]"
            )}
          >
            <Globe className="w-3 h-3" /> Web
          </button>
          <button
            onClick={() => { setSearchScope("local"); setLocalResults([]); setResults([]); setError(null); }}
            className={cn(
              "rounded-full px-3 py-1 text-xs transition-colors flex items-center gap-1",
              searchScope === "local" ? "bg-violet-600 text-white" : "bg-[#f3f2ee] text-[#44403c] hover:bg-[#eeeee8]"
            )}
          >
            <MapPin className="w-3 h-3" /> In Graph
          </button>
          {searchScope === "web" && (
            <>
              <div className="w-px h-4 bg-[#e8e7e2] mx-1" />
              {MODE_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setSearchMode(m.value)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs transition-colors",
                    searchMode === m.value ? "bg-violet-600 text-white" : "bg-[#f3f2ee] text-[#44403c] hover:bg-[#eeeee8]"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Results area */}
        <div className="max-h-[400px] overflow-y-auto">
          {error && <p className="text-sm text-red-400 px-4 py-3">{error}</p>}

          {isSearching && (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="animate-pulse space-y-2 p-3 rounded-lg bg-[#f3f2ee]/60">
                  <div className="h-4 bg-[#f3f2ee] rounded w-3/4" />
                  <div className="h-3 bg-[#f3f2ee] rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Web search results */}
          {!isSearching && results.length > 0 && searchScope === "web" && (
            <div className="divide-y divide-[#e8e7e2]">
              <div className="px-4 py-2 flex items-center justify-between">
                <span className="text-xs text-[#78716c]">{results.length} results</span>
                <button
                  onClick={addAllToGraph}
                  className="text-xs text-[#7c3aed] hover:text-[#6d28d9] font-medium"
                >
                  Add all to graph
                </button>
              </div>
              {results.map((paper) => (
                <button
                  key={paper.id || paper.title}
                  onClick={() => addToGraph(paper)}
                  className="w-full text-left px-4 py-3 hover:bg-[#f3f2ee] transition-colors"
                >
                  <h4 className="text-sm text-[#1c1917] font-medium line-clamp-2">{paper.title}</h4>
                  <p className="text-[10px] text-[#78716c] mt-0.5">
                    {paper.authors?.slice(0, 2).map((a) => a.name).join(", ")}
                    {paper.year ? ` · ${paper.year}` : ""}
                    {paper.citationCount > 0 ? ` · ${paper.citationCount} citations` : ""}
                  </p>
                  {paper.abstract && (
                    <p className="text-[11px] text-[#a8a29e] mt-1 line-clamp-2">{paper.abstract}</p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Local results */}
          {localResults.length > 0 && searchScope === "local" && (
            <div className="divide-y divide-[#e8e7e2]">
              {localResults.map((hit) => {
                const node = graphNodes.get(hit.nodeId);
                if (!node) return null;
                return (
                  <button
                    key={hit.nodeId}
                    onClick={() => { selectNode(hit.nodeId); toggleSearch(); }}
                    className="w-full text-left px-4 py-3 hover:bg-[#f3f2ee] transition-colors"
                  >
                    <h4 className="text-sm text-[#1c1917] font-medium line-clamp-1">{node.data.title}</h4>
                    <p className="text-[10px] text-[#78716c] mt-0.5">
                      Match in {hit.matchField} · Score: {Math.round(hit.score * 100)}%
                    </p>
                    {hit.snippet && (
                      <p className="text-[11px] text-[#a8a29e] mt-1 line-clamp-1">{hit.snippet}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          <AnimatePresence>
            {!isSearching && results.length === 0 && localResults.length === 0 && !error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-8 px-4"
              >
                {inputValue.trim() ? (
                  <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-[#7c3aed] text-white rounded-lg hover:bg-[#6d28d9] transition-colors disabled:opacity-50"
                  >
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Search for &quot;{inputValue}&quot;
                  </button>
                ) : (
                  <>
                    <p className="text-sm text-[#78716c] mb-2">
                      {searchScope === "local" ? "Search within your current graph" : "Type a research question or topic"}
                    </p>
                    <p className="text-xs text-[#a8a29e]">
                      Press <kbd className="px-1.5 py-0.5 bg-[#f3f2ee] rounded text-[#57534e] text-[10px] font-mono">Cmd+K</kbd> anytime
                    </p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
