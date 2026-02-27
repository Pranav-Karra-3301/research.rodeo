"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { Send, Sparkles, Loader2, Search, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGraphStore } from "@/store/graph-store";
import { assembleContext } from "@/lib/agents/context";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { CitationBadge } from "./CitationBadge";
import { ThinkingIndicator } from "./ThinkingIndicator";
import { SuggestedQuestions } from "./SuggestedQuestions";
import type { PaperNode, Cluster, WeightConfig } from "@/types";

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

const TOOL_LABELS: Record<string, string> = {
  searchPapers: "Searching for papers",
  searchWithinHole: "Searching within rabbit hole",
  expandPaper: "Expanding paper neighborhood",
  expandNode: "Expanding node",
  expandGraphNode: "Expanding node",
  getPaperDetails: "Fetching paper details",
  fetchUrlContent: "Reading URL content",
  traceBacklinks: "Tracing citation links",
  summarizeCluster: "Summarizing cluster",
  summarizeClusterData: "Extracting cluster data",
  findContradictions: "Finding contradictions",
  findGaps: "Identifying research gaps",
  addGraphNode: "Adding node to graph",
  connectGraphNodes: "Connecting nodes",
  mergeGraphClusters: "Merging clusters",
  archiveGraphNode: "Archiving node",
  relayoutGraph: "Recomputing layout",
  addContradictionCard: "Adding contradiction",
  draftLitReview: "Drafting literature review",
  getRecommendations: "Finding recommendations",
  analyzeClusters: "Analyzing clusters",
};

type Citation = { start: number; end: number; paperId: string; title: string; year?: number };

/** Normalize a string for fuzzy comparison: lowercase, strip punctuation, collapse whitespace. */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

/** Return the fraction of `needle` words found in `haystack`. */
function wordOverlapScore(needle: string, haystack: string): number {
  const needleWords = needle.split(" ").filter((w) => w.length > 2);
  if (needleWords.length === 0) return 0;
  const haystackWords = new Set(haystack.split(" "));
  const matches = needleWords.filter((w) => haystackWords.has(w)).length;
  return matches / needleWords.length;
}

function parseCitations(text: string, nodes: PaperNode[]): Citation[] {
  const results: Citation[] = [];
  // Match [Title, Year], [Title](nodeId), or plain [Title] patterns
  const regex = /\[([^\]]+?)(?:,\s*(\d{4}))?\](?:\(([^)]+)\))?/g;
  const nodeArr = nodes instanceof Map ? Array.from(nodes.values()) : nodes;
  let m: RegExpExecArray | null;

  // Pre-compute normalized titles for all nodes
  const normalizedNodes = nodeArr.map((n) => ({
    node: n,
    normalized: normalizeForMatch(n.data.title),
    year: n.data.year,
  }));

  while ((m = regex.exec(text)) !== null) {
    const rawCited = m[1].trim();
    const year = m[2] ? parseInt(m[2]) : undefined;
    const linkedId = m[3]?.trim();

    // Strategy 1: If there's a linked ID like [Title](nodeId), match by ID first
    if (linkedId) {
      const byId = nodeArr.find((n) => n.id === linkedId);
      if (byId) {
        results.push({
          start: m.index, end: m.index + m[0].length,
          paperId: byId.id, title: byId.data.title,
          year: byId.data.year ?? year,
        });
        continue;
      }
    }

    const normalizedCited = normalizeForMatch(rawCited);
    let bestMatch: PaperNode | null = null;
    let bestScore = 0;

    for (const { node, normalized, year: nodeYear } of normalizedNodes) {
      // Strategy 2: Exact match on normalized strings
      if (normalized === normalizedCited) {
        bestMatch = node;
        bestScore = 1;
        break;
      }

      // Strategy 3: One contains the other (normalized)
      if (normalized.includes(normalizedCited) || normalizedCited.includes(normalized)) {
        const containScore = 0.95;
        if (containScore > bestScore) {
          bestMatch = node;
          bestScore = containScore;
        }
        continue;
      }

      // Strategy 4: Year match + first few words overlap
      if (year && nodeYear === year) {
        const overlap = wordOverlapScore(normalizedCited, normalized);
        const yearBoostedScore = overlap * 0.85 + 0.1; // year match gives a baseline boost
        if (yearBoostedScore > bestScore) {
          bestMatch = node;
          bestScore = yearBoostedScore;
        }
        continue;
      }

      // Strategy 5: Fuzzy word overlap (>80% of citation words found in title)
      const overlap = wordOverlapScore(normalizedCited, normalized);
      if (overlap > bestScore) {
        bestMatch = node;
        bestScore = overlap;
      }
    }

    // Require at least 0.8 score for fuzzy matches (strategies 4 & 5)
    if (bestMatch && bestScore >= 0.8) {
      results.push({
        start: m.index, end: m.index + m[0].length,
        paperId: bestMatch.id, title: bestMatch.data.title,
        year: bestMatch.data.year ?? year,
      });
    }
  }
  return results;
}

function CitationText({ content, nodes }: { content: string; nodes: PaperNode[] }) {
  const cites = parseCitations(content, nodes);
  if (!cites.length) return <MarkdownRenderer content={content} />;
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const c of cites) {
    if (c.start > last) parts.push(content.slice(last, c.start));
    parts.push(<CitationBadge key={`c-${c.start}`} paperId={c.paperId} title={c.title} year={c.year} />);
    last = c.end;
  }
  if (last < content.length) parts.push(content.slice(last));
  return <div className="text-sm leading-relaxed text-[#1c1917]">{parts}</div>;
}

function UserMessage({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] bg-[#ede9fe] rounded-2xl px-4 py-2.5 text-[#1c1917] text-sm">
        <span className="whitespace-pre-wrap">{text}</span>
      </div>
    </div>
  );
}

function AssistantMessage({ message, nodes, isStreaming }: {
  message: UIMessage; nodes: PaperNode[]; isStreaming: boolean;
}) {
  const text = getMessageText(message);
  const tools = getToolParts(message);
  const hasCites = parseCitations(text, nodes).length > 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        {tools.map((tool, i) => {
          const inv = "toolInvocation" in tool
            ? (tool as { toolInvocation: { toolName: string; state: string } }).toolInvocation
            : null;
          const name = inv?.toolName || "unknown";
          const active = inv ? inv.state !== "result" : false;
          const label = TOOL_LABELS[name] || `Running ${name}`;
          return (
            <div key={`t-${i}`} className="flex items-center gap-2 text-xs text-[#78716c] py-1">
              {active ? (
                <Loader2 className="h-3 w-3 animate-spin text-[#57534e]" />
              ) : name === "searchPapers" ? (
                <Search className="h-3 w-3 text-[#78716c]" />
              ) : (
                <GitBranch className="h-3 w-3 text-[#78716c]" />
              )}
              <span>{label}{active ? "..." : ""}</span>
            </div>
          );
        })}
        {isStreaming && !text && tools.length === 0 && (
          <ThinkingIndicator label="Thinking" isActive />
        )}
        {text && (hasCites
          ? <CitationText content={text} nodes={nodes} />
          : <MarkdownRenderer content={text} />
        )}
        {isStreaming && text && (
          <span className="inline-block w-1.5 h-4 bg-[#57534e] animate-pulse rounded-sm ml-0.5 align-text-bottom" />
        )}
      </div>
    </div>
  );
}

interface ChatPanelProps { className?: string }

export function ChatPanel({ className }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");
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
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [inputValue]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;
    sendMessage({ text: inputValue });
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [inputValue, isLoading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const nodeArray: PaperNode[] = nodes instanceof Map ? Array.from(nodes.values()) : (nodes ?? []);

  return (
    <div className={cn("flex flex-col h-full bg-[#f8f7f4] border-l border-[#e8e7e2]", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-12 border-b border-[#e8e7e2] flex-shrink-0">
        <div className={cn("h-2 w-2 rounded-full", isLoading ? "bg-[#57534e] animate-pulse" : "bg-[#a8a29e]")} />
        <span className="text-sm font-medium text-[#1c1917]">Research Assistant</span>
        {isLoading && <span className="text-xs text-[#78716c] ml-auto">Generating...</span>}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-5">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-[#ecebe6] border border-[#dddcd7]">
              <Sparkles className="h-5 w-5 text-[#57534e]" />
            </div>
            <div>
              <p className="text-sm text-[#44403c] mb-1">Research Assistant</p>
              <p className="text-xs text-[#78716c] max-w-[240px]">
                Ask questions about your papers, find gaps, or draft a literature review.
              </p>
            </div>
            <SuggestedQuestions onSelect={(q) => sendMessage({ text: q })} className="max-w-sm" />
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => {
              const isLast = idx === messages.length - 1;
              if (msg.role === "user") {
                const t = getMessageText(msg);
                return t ? <UserMessage key={msg.id} text={t} /> : null;
              }
              return (
                <AssistantMessage
                  key={msg.id} message={msg} nodes={nodeArray}
                  isStreaming={isLast && isLoading && msg.role === "assistant"}
                />
              );
            })}
            {isLoading && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
              <div className="flex items-center gap-2 text-xs text-[#78716c] py-1">
                <Loader2 className="h-3 w-3 animate-spin text-[#57534e]" />
                <span>Thinking...</span>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[#e8e7e2] p-3 flex-shrink-0">
        <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="relative">
          <textarea
            ref={textareaRef} value={inputValue}
            onChange={(e) => setInputValue(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Ask about your papers..." rows={1}
            className="w-full resize-none rounded-xl bg-white border border-[#dddcd7] px-4 py-2.5 pr-12 text-sm text-[#1c1917] placeholder-[#a8a29e] focus:outline-none focus:border-[#c8c7c2] focus:bg-[#f3f2ee] transition-colors"
          />
          <button
            type="submit" disabled={isLoading || !inputValue.trim()}
            className={cn(
              "absolute right-2 bottom-2 p-1.5 rounded-lg transition-colors",
              inputValue.trim() && !isLoading ? "text-[#57534e] hover:bg-[#f3f2ee]" : "text-[#a8a29e] cursor-not-allowed"
            )}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
        <p className="text-[10px] text-[#a8a29e] mt-1.5 text-center">
          Enter to send &middot; Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
