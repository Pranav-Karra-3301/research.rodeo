"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  Send,
  Loader2,
  Search,
  MessageSquare,
  Plus,
  X,
  Check,
  GitBranch,
  Sparkles,
} from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui-store";
import { useGraphStore } from "@/store/graph-store";
import { executeGraphCommand } from "@/lib/graph/commands";
import { assembleContext } from "@/lib/agents/context";
import { MarkdownRenderer } from "./MarkdownRenderer";
import type { ChatInputMode } from "@/store/ui-store";
import type { PaperMetadata, PaperNode, Cluster, WeightConfig } from "@/types";

type SearchType = "auto" | "instant" | "fast" | "deep";

interface SearchResultItem {
  paper: PaperMetadata;
  added: boolean;
}

const SEARCH_TYPE_OPTIONS: { value: SearchType; label: string; description: string }[] = [
  { value: "auto", label: "Auto", description: "Smart mix of neural + keyword" },
  { value: "instant", label: "Instant", description: "Sub-200ms, real-time" },
  { value: "fast", label: "Fast", description: "Streamlined neural search" },
  { value: "deep", label: "Deep", description: "Thorough, multi-pass search" },
];

const DOMAIN_CHIPS = [
  { label: "arXiv", domain: "arxiv.org" },
  { label: "Semantic Scholar", domain: "semanticscholar.org" },
  { label: "OpenReview", domain: "openreview.net" },
  { label: "ACM", domain: "acm.org" },
];

const TOOL_LABELS: Record<string, string> = {
  searchPapers: "Searching papers",
  expandPaper: "Expanding neighborhood",
  expandNode: "Expanding node",
  expandGraphNode: "Expanding node",
  getPaperDetails: "Fetching details",
  addGraphNode: "Adding to graph",
  connectGraphNodes: "Connecting nodes",
  archiveGraphNode: "Archiving node",
  relayoutGraph: "Recomputing layout",
  summarizeCluster: "Summarizing cluster",
  findContradictions: "Finding contradictions",
  findGaps: "Identifying gaps",
  draftLitReview: "Drafting review",
  getRecommendations: "Finding recommendations",
  analyzeClusters: "Analyzing clusters",
};

function getMessageText(msg: UIMessage): string {
  return msg.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function getToolParts(msg: UIMessage) {
  return msg.parts.filter(
    (p): p is Extract<UIMessage["parts"][number], { type: "tool-invocation" }> =>
      p.type === "tool-invocation"
  );
}

export function UnifiedChatInput() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const chatInputMode = useUIStore((s) => s.chatInputMode);
  const setChatInputMode = useUIStore((s) => s.setChatInputMode);

  // --- Search state ---
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [searchType, setSearchType] = useState<SearchType>("auto");
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);

  // --- Chat state (inline, via useChat) ---
  const [showChat, setShowChat] = useState(false);

  const nodes = useGraphStore((s) => s.nodes);
  const clusters = useGraphStore((s) => s.clusters);
  const query = useGraphStore((s) => s.query);
  const weights = useGraphStore((s) => s.weights);

  const getProjectContext = useCallback(() => {
    const nodeArr: PaperNode[] = nodes instanceof Map ? Array.from(nodes.values()) : (nodes ?? []);
    const clusterArr: Cluster[] = clusters ?? [];
    const w: WeightConfig = weights ?? {
      influence: 0.2, recency: 0.2, semanticSimilarity: 0.3, localCentrality: 0.2, velocity: 0.1,
    };
    if (nodeArr.length === 0) return [];
    return assembleContext(
      { rootQuery: query || "research exploration", weights: w, nodes: nodeArr, clusters: clusterArr },
      ""
    );
  }, [nodes, clusters, query, weights]);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat", body: { projectContext: getProjectContext() } }),
    [getProjectContext]
  );
  const { messages, sendMessage, status } = useChat({ transport });
  const isChatLoading = status === "submitted" || status === "streaming";

  // Auto-scroll chat popover when messages update
  useEffect(() => {
    if (showChat) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, showChat]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 80)}px`;
  }, [inputValue]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;

    if (chatInputMode === "search") {
      if (searchLoading) return;
      void performSearch(inputValue.trim());
    } else {
      if (isChatLoading) return;
      setShowChat(true);
      sendMessage({ text: inputValue.trim() });
    }
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [inputValue, chatInputMode, searchLoading, isChatLoading, sendMessage]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const performSearch = async (searchQuery: string) => {
    setSearchLoading(true);
    setSearchError(null);
    setShowResults(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: searchQuery,
          searchMode: searchType,
          domains: selectedDomains.length > 0 ? selectedDomains : undefined,
        }),
      });
      const json = await res.json();

      if (!res.ok || json.status !== "success") {
        setSearchError(json.error ?? `Search failed (${res.status})`);
        setSearchResults([]);
        return;
      }

      const papers = (json.data?.papers ?? []) as PaperMetadata[];
      if (papers.length === 0) {
        setSearchError("No papers found. Try a different query or search type.");
        setSearchResults([]);
        return;
      }

      setSearchResults(papers.map((p) => ({ paper: p, added: false })));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddToGraph = useCallback(async (index: number) => {
    const item = searchResults[index];
    if (!item || item.added) return;

    const result = await executeGraphCommand({
      type: "add-node",
      paper: item.paper,
      materialize: false,
      source: "canvas",
    });

    if (result.applied) {
      setSearchResults((prev) =>
        prev.map((r, i) => (i === index ? { ...r, added: true } : r))
      );
    }
  }, [searchResults]);

  const handleAddAllToGraph = useCallback(async () => {
    const unadded = searchResults.filter((r) => !r.added);
    if (unadded.length === 0) return;

    const graphStore = useGraphStore.getState();
    graphStore.setLoading(true);
    try {
      for (let i = 0; i < searchResults.length; i++) {
        if (searchResults[i].added) continue;
        await executeGraphCommand({
          type: "add-node",
          paper: searchResults[i].paper,
          materialize: false,
          source: "canvas",
        });
      }
      setSearchResults((prev) => prev.map((r) => ({ ...r, added: true })));
    } finally {
      graphStore.setLoading(false);
    }
  }, [searchResults]);

  const toggleDomain = useCallback((domain: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const modeOptions: { value: ChatInputMode; icon: typeof MessageSquare; label: string }[] = [
    { value: "chat", icon: MessageSquare, label: "Chat" },
    { value: "search", icon: Search, label: "Search" },
  ];

  const anyLoading = searchLoading || isChatLoading;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[620px] max-w-[calc(100%-2rem)]">
      {/* Search results popover */}
      {showResults && chatInputMode === "search" && (searchResults.length > 0 || searchLoading || searchError) && (
        <div className="mb-2 bg-white rounded-xl border border-[#e8e7e2] shadow-lg max-h-[340px] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#e8e7e2]">
            <span className="text-xs font-medium text-[#57534e]">
              {searchLoading
                ? "Searching..."
                : searchError
                  ? "Search error"
                  : `${searchResults.length} results`}
            </span>
            <div className="flex items-center gap-2">
              {searchResults.length > 0 && searchResults.some((r) => !r.added) && (
                <button
                  onClick={handleAddAllToGraph}
                  className="text-[10px] font-medium text-[#7c3aed] hover:text-[#6d28d9] transition-colors"
                >
                  Add all
                </button>
              )}
              <button onClick={() => setShowResults(false)} className="text-[#78716c] hover:text-[#44403c]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {searchLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse space-y-1.5 p-2 rounded-lg bg-[#f3f2ee]/60">
                  <div className="h-3.5 bg-[#e8e7e2] rounded w-3/4" />
                  <div className="h-2.5 bg-[#e8e7e2] rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : searchError ? (
            <div className="px-3 py-4 text-center text-xs text-[#ef4444]">
              {searchError}
            </div>
          ) : (
            searchResults.map((item, i) => (
              <div
                key={item.paper.id || i}
                className="flex items-start gap-2 px-3 py-2 hover:bg-[#f3f2ee]/60 border-b border-[#e8e7e2]/50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#1c1917] line-clamp-2 leading-tight">
                    {item.paper.title}
                  </p>
                  <p className="text-[10px] text-[#78716c] truncate mt-0.5">
                    {item.paper.authors.map((a) => a.name).join(", ")}
                    {item.paper.year ? ` (${item.paper.year})` : ""}
                    {item.paper.citationCount > 0 ? ` — ${item.paper.citationCount} citations` : ""}
                    {item.paper.externalIds?.arxivId ? " — arXiv" : ""}
                  </p>
                  {item.paper.abstract && (
                    <p className="text-[10px] text-[#a8a29e] line-clamp-1 mt-0.5">
                      {item.paper.abstract.slice(0, 150)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleAddToGraph(i)}
                  disabled={item.added}
                  className={cn(
                    "shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors mt-0.5",
                    item.added
                      ? "text-[#22c55e] bg-[#dcfce7]"
                      : "text-[#7c3aed] bg-[#ede9fe] hover:bg-[#ddd6fe]"
                  )}
                >
                  {item.added ? (
                    <>
                      <Check className="w-3 h-3" />
                      Added
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3" />
                      Add
                    </>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Chat popover — inline messages above the input */}
      {showChat && chatInputMode === "chat" && (
        <div className="mb-2 bg-white rounded-xl border border-[#e8e7e2] shadow-lg max-h-[400px] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#e8e7e2]">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#57534e]" />
              <span className="text-xs font-medium text-[#57534e]">Chat</span>
            </div>
            <button onClick={() => setShowChat(false)} className="text-[#78716c] hover:text-[#44403c]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="px-3 py-3 space-y-3">
            {messages.length === 0 && !isChatLoading && (
              <p className="text-xs text-[#a8a29e] text-center py-2">
                Ask about your papers, find gaps, or explore connections.
              </p>
            )}
            {messages.map((msg, idx) => {
              const isLast = idx === messages.length - 1;
              const text = getMessageText(msg);

              if (msg.role === "user") {
                return text ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] bg-[#ede9fe] rounded-xl px-3 py-2 text-[12px] text-[#1c1917]">
                      <span className="whitespace-pre-wrap">{text}</span>
                    </div>
                  </div>
                ) : null;
              }

              // Assistant message
              const tools = getToolParts(msg);
              const isStreaming = isLast && isChatLoading && msg.role === "assistant";
              return (
                <div key={msg.id} className="flex justify-start">
                  <div className="max-w-[85%] space-y-1.5">
                    {tools.map((tool, ti) => {
                      const inv = "toolInvocation" in tool
                        ? (tool as { toolInvocation: { toolName: string; state: string } }).toolInvocation
                        : null;
                      const name = inv?.toolName || "unknown";
                      const active = inv ? inv.state !== "result" : false;
                      const label = TOOL_LABELS[name] || `Running ${name}`;
                      return (
                        <div key={`t-${ti}`} className="flex items-center gap-1.5 text-[10px] text-[#78716c] py-0.5">
                          {active ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin text-[#57534e]" />
                          ) : (
                            <GitBranch className="h-2.5 w-2.5 text-[#78716c]" />
                          )}
                          <span>{label}{active ? "..." : ""}</span>
                        </div>
                      );
                    })}
                    {isStreaming && !text && tools.length === 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-[#78716c] py-0.5">
                        <Loader2 className="h-2.5 w-2.5 animate-spin text-[#57534e]" />
                        <span>Thinking...</span>
                      </div>
                    )}
                    {text && (
                      <div className="text-[12px] leading-relaxed text-[#1c1917] [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_h1]:text-sm [&_h2]:text-[13px] [&_h3]:text-[12px] [&_ul]:text-[12px] [&_ol]:text-[12px] [&_li]:my-0.5 [&_code]:text-[11px]">
                        <MarkdownRenderer content={text} />
                      </div>
                    )}
                    {isStreaming && text && (
                      <span className="inline-block w-1 h-3 bg-[#57534e] animate-pulse rounded-sm ml-0.5 align-text-bottom" />
                    )}
                  </div>
                </div>
              );
            })}
            {isChatLoading && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-1.5 text-[10px] text-[#78716c] py-0.5">
                <Loader2 className="h-2.5 w-2.5 animate-spin text-[#57534e]" />
                <span>Thinking...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      {/* Search options (visible in search mode) */}
      {chatInputMode === "search" && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5 px-1">
          {SEARCH_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSearchType(opt.value)}
              title={opt.description}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                searchType === opt.value
                  ? "bg-[#7c3aed] text-white"
                  : "bg-white/80 text-[#57534e] hover:bg-white border border-[#e8e7e2]"
              )}
            >
              {opt.label}
            </button>
          ))}
          <div className="w-px h-3 bg-[#e8e7e2] mx-0.5" />
          {DOMAIN_CHIPS.map((d) => (
            <button
              key={d.domain}
              onClick={() => toggleDomain(d.domain)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors",
                selectedDomains.includes(d.domain)
                  ? "bg-[#7c3aed]/15 text-[#7c3aed] border border-[#7c3aed]/30"
                  : "bg-white/80 text-[#78716c] hover:text-[#57534e] border border-[#e8e7e2]"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="bg-white rounded-xl border border-[#e8e7e2] shadow-lg flex items-end gap-2 px-2 py-2">
        {/* Mode toggle */}
        <div className="flex items-center rounded-lg bg-[#f3f2ee] p-0.5 shrink-0 mb-0.5">
          {modeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                setChatInputMode(opt.value);
                setShowResults(false);
                setSearchError(null);
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                chatInputMode === opt.value
                  ? "bg-white text-[#1c1917] shadow-sm"
                  : "text-[#78716c] hover:text-[#44403c]"
              )}
            >
              <opt.icon className="w-3 h-3" />
              {opt.label}
            </button>
          ))}
        </div>

        {/* Text input */}
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            chatInputMode === "chat"
              ? "Ask about your research..."
              : "Search papers on arXiv, Semantic Scholar..."
          }
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none py-1.5 min-h-[32px]"
        />

        {/* Send / Search button */}
        <button
          onClick={handleSend}
          disabled={anyLoading || !inputValue.trim()}
          className={cn(
            "shrink-0 p-1.5 rounded-lg transition-colors mb-0.5",
            inputValue.trim() && !anyLoading
              ? "text-[#57534e] hover:bg-[#f3f2ee]"
              : "text-[#a8a29e] cursor-not-allowed"
          )}
        >
          {anyLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
