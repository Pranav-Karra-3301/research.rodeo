"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Loader2, Globe, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useUIStore } from "@/store/ui-store";
import { useGraphStore } from "@/store/graph-store";
import { executeGraphCommand } from "@/lib/graph/commands";
import { useRabbitHoleStore, newRabbitHoleId } from "@/store/rabbit-hole-store";
import { useTimelineStore } from "@/store/timeline-store";
import { cn } from "@/lib/utils";
import { searchWithinGraph, type SearchHit } from "@/lib/graph/search";
import { SearchResults } from "./SearchResults";
import { LocalSearchResults } from "./LocalSearchResults";
import type { PaperMetadata } from "@/types";

type SearchMode = "auto" | "instant" | "fast" | "deep";

const DOMAIN_OPTIONS = [
  { label: "arxiv.org", value: "arxiv.org" },
  { label: "semanticscholar.org", value: "semanticscholar.org" },
  { label: "openreview.net", value: "openreview.net" },
  { label: "acm.org", value: "acm.org" },
];

const MODE_OPTIONS: { value: SearchMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "instant", label: "Instant" },
  { value: "fast", label: "Fast" },
  { value: "deep", label: "Deep" },
];

export function SearchBar() {
  const searchOpen = useUIStore((s) => s.searchOpen);
  const toggleSearch = useUIStore((s) => s.toggleSearch);
  const setQuery = useGraphStore((s) => s.setQuery);
  const setLoading = useGraphStore((s) => s.setLoading);

  const dbConnection = useRabbitHoleStore((s) => s.dbConnection);
  const currentRabbitHoleId = useRabbitHoleStore((s) => s.currentRabbitHoleId);
  const setCurrentRabbitHoleId = useRabbitHoleStore((s) => s.setCurrentRabbitHoleId);

  const graphNodes = useGraphStore((s) => s.nodes);
  const selectNode = useGraphStore((s) => s.selectNode);

  const [inputValue, setInputValue] = useState("");
  const [searchScope, setSearchScope] = useState<"web" | "local">("local");
  const [searchMode, setSearchMode] = useState<SearchMode>("auto");
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PaperMetadata[]>([]);
  const [localResults, setLocalResults] = useState<SearchHit[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        toggleSearch();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSearch]);

  useEffect(() => {
    if (searchOpen) {
      setError(null);
      setResults([]);
      setLocalResults([]);
      setSelectedIdx(-1);
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setInputValue("");
      setSelectedDomains([]);
      setError(null);
      setResults([]);
      setLocalResults([]);
    }
  }, [searchOpen]);

  // Live local search as user types (debounced)
  useEffect(() => {
    if (searchScope !== "local") return;
    const query = inputValue.trim();
    if (!query || query.length < 2) {
      setLocalResults([]);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      const hits = searchWithinGraph(query, graphNodes, 20);
      setLocalResults(hits);
      if (hits.length === 0 && query.length > 2) {
        setError("No matches found in your graph.");
      } else {
        setError(null);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [inputValue, searchScope, graphNodes]);

  const toggleDomain = useCallback((domain: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  }, []);

  const handleLocalSearch = useCallback(() => {
    const query = inputValue.trim();
    if (!query) return;
    setError(null);
    setResults([]);
    setSelectedIdx(-1);
    const hits = searchWithinGraph(query, graphNodes, 20);
    if (hits.length === 0) {
      setError("No matches found in your graph. Try a different query.");
    }
    setLocalResults(hits);
    useTimelineStore.getState().addEvent({
      type: "search",
      summary: `Searched graph for "${query}" — ${hits.length} matches`,
      metadata: { query, scope: "local", resultCount: hits.length },
    });
  }, [inputValue, graphNodes]);

  const handleSearch = useCallback(async () => {
    if (searchScope === "local") {
      handleLocalSearch();
      return;
    }

    const query = inputValue.trim();
    if (!query || isSearching) return;
    setError(null);
    setIsSearching(true);
    setResults([]);
    setLocalResults([]);
    setSelectedIdx(-1);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: query,
          searchMode,
          domains: selectedDomains.length > 0 ? selectedDomains : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data?.error ?? `Search failed (${res.status})`); return; }
      if (data.status !== "success" || !data.data?.papers?.length) {
        setError("No papers found. Try a different query.");
        return;
      }
      setResults(data.data.papers);
      useTimelineStore.getState().addEvent({
        type: "search",
        summary: `Searched "${query}" — ${data.data.papers.length} results`,
        metadata: { query, resultCount: data.data.papers.length },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setIsSearching(false);
    }
  }, [inputValue, isSearching, searchMode, selectedDomains, searchScope, handleLocalSearch]);

  /** Ensure a rabbit hole exists (create one for the first search). */
  const ensureRabbitHole = useCallback(async (query: string): Promise<string | null> => {
    if (currentRabbitHoleId) return currentRabbitHoleId;
    if (!dbConnection) return null;
    const id = newRabbitHoleId();
    dbConnection.reducers.createRabbitHole({ id, name: query.slice(0, 50), rootQuery: query });
    setCurrentRabbitHoleId(id);
    return id;
  }, [currentRabbitHoleId, dbConnection, setCurrentRabbitHoleId]);

  const addToGraph = useCallback(async (paper: PaperMetadata) => {
    setLoading(true);
    try {
      await ensureRabbitHole(inputValue.trim() || paper.title);
      const result = await executeGraphCommand({
        type: "add-node",
        paper,
        materialize: false,
        source: "canvas",
      });
      if (!result.applied) {
        setError(result.error ?? "Failed to add source to graph");
      }
    } finally {
      setLoading(false);
    }
  }, [setLoading, ensureRabbitHole, inputValue]);

  const addAllToGraph = useCallback(async () => {
    if (results.length === 0) return;
    setLoading(true);
    try {
      const query = inputValue.trim();
      await ensureRabbitHole(query || results[0].title);
      setQuery(query);
      let hadError = false;

      for (const paper of results) {
        const result = await executeGraphCommand({
          type: "add-node",
          paper,
          materialize: false,
          source: "canvas",
        });
        if (!result.applied) {
          setError(result.error ?? "Failed to add one or more sources");
          hadError = true;
          break;
        }
      }

      if (!hadError) {
        toggleSearch();
      }
    } finally {
      setLoading(false);
    }
  }, [results, inputValue, setQuery, setLoading, toggleSearch, ensureRabbitHole]);

  const handleSelectLocalResult = useCallback((nodeId: string) => {
    selectNode(nodeId);
    toggleSearch();
  }, [selectNode, toggleSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && results.length === 0 && localResults.length === 0) handleSearch();
    else if (e.key === "Enter" && selectedIdx >= 0 && results[selectedIdx]) addToGraph(results[selectedIdx]);
    else if (e.key === "ArrowDown" && results.length > 0) { e.preventDefault(); setSelectedIdx((p) => Math.min(p + 1, results.length - 1)); }
    else if (e.key === "ArrowUp" && results.length > 0) { e.preventDefault(); setSelectedIdx((p) => Math.max(p - 1, 0)); }
    else if (e.key === "Escape") toggleSearch();
  };

  return (
    <Dialog open={searchOpen} onOpenChange={toggleSearch}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 overflow-hidden bg-[#f8f7f4] border-[#e8e7e2]/50">
        <DialogTitle className="sr-only">Search papers</DialogTitle>
        <div className="flex items-center border-b border-[#e8e7e2]/40 px-4 transition-colors">
          <Search className="w-5 h-5 text-[#78716c] shrink-0" />
          <input ref={inputRef} value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
            placeholder={searchScope === "local" ? "Search in this graph…" : "Search papers, topics, or questions..."}
            className="flex-1 bg-transparent border-0 px-3 py-4 text-sm text-[#1c1917] placeholder:text-[#a8a29e] focus:outline-none focus-visible:outline-none" />
          {inputValue && (
            <button type="button" onClick={() => setInputValue("")} className="text-[#78716c] hover:text-[#44403c] outline-none focus:outline-none focus-visible:outline-none">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-4 py-2 flex flex-wrap items-center gap-3 border-b border-[#e8e7e2]/40">
          {/* Scope toggle: Web vs Local */}
          <button
            type="button"
            onClick={() => { setSearchScope("web"); setLocalResults([]); setResults([]); setError(null); }}
            className={cn("text-xs transition-colors flex items-center gap-1.5 py-1 outline-none focus:outline-none focus-visible:outline-none",
              searchScope === "web"
                ? "text-[#1c1917] font-medium"
                : "text-[#78716c] hover:text-[#44403c]"
            )}
          >
            <Globe className="w-3 h-3" /> Web
          </button>
          <button
            type="button"
            onClick={() => { setSearchScope("local"); setLocalResults([]); setResults([]); setError(null); }}
            className={cn("text-xs transition-colors flex items-center gap-1.5 py-1 outline-none focus:outline-none focus-visible:outline-none",
              searchScope === "local"
                ? "text-[#1c1917] font-medium"
                : "text-[#78716c] hover:text-[#44403c]"
            )}
          >
            <MapPin className="w-3 h-3" /> In Graph
          </button>

          {searchScope === "web" && (
            <>
              <div className="w-px h-4 bg-[#e8e7e2]/60 mx-0.5" />
              {DOMAIN_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDomain(d.value)}
                  className={cn("px-2 py-1 text-xs transition-colors outline-none focus:outline-none focus-visible:outline-none",
                    selectedDomains.includes(d.value)
                      ? "text-[#1c1917] font-medium"
                      : "text-[#78716c] hover:text-[#44403c]"
                  )}>{d.label}</button>
              ))}
              <div className="w-px h-4 bg-[#e8e7e2]/60 mx-0.5" />
              {MODE_OPTIONS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setSearchMode(m.value)}
                  className={cn("px-2 py-1 text-xs transition-colors outline-none focus:outline-none focus-visible:outline-none",
                    searchMode === m.value
                      ? "text-[#1c1917] font-medium"
                      : "text-[#78716c] hover:text-[#44403c]"
                  )}>{m.label}</button>
              ))}
            </>
          )}
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {error && <p className="text-sm text-red-400 px-4 py-3" role="alert">{error}</p>}
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
            <SearchResults results={results} selectedIdx={selectedIdx}
              onSelect={setSelectedIdx} onAdd={addToGraph} onAddAll={addAllToGraph} />
          )}
          {/* Local graph search results */}
          {localResults.length > 0 && searchScope === "local" && (
            <LocalSearchResults
              results={localResults}
              nodes={graphNodes}
              selectedIdx={selectedIdx}
              onSelect={setSelectedIdx}
              onNavigate={handleSelectLocalResult}
            />
          )}
          <AnimatePresence>
            {!isSearching && results.length === 0 && localResults.length === 0 && !error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center py-8 px-4">
                {inputValue.trim() ? (
                  <Button onClick={handleSearch} disabled={isSearching} className="gap-2">
                    {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    {searchScope === "local"
                      ? `Search graph for "${inputValue}"`
                      : `Search for "${inputValue}"`}
                  </Button>
                ) : (
                  <>
                    <p className="text-sm text-[#78716c] mb-2">
                      {searchScope === "local"
                        ? "Search within your current graph"
                        : "Type a research question or topic"}
                    </p>
                    <p className="text-xs text-[#a8a29e]">
                      Press <kbd className="text-[#57534e] text-[10px] font-mono">Cmd+K</kbd> anytime to search
                    </p>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
