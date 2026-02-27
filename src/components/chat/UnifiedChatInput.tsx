"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Send, Loader2, Search, MessageSquare, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/ui-store";
import type { ChatInputMode } from "@/store/ui-store";
import type { PaperMetadata } from "@/types";

interface SearchResultItem {
  id: string;
  title: string;
  authors: string;
  year?: number;
  url?: string;
  snippet?: string;
  source: string;
}

interface UnifiedChatInputProps {
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

export function UnifiedChatInput({ onSendMessage, isLoading }: UnifiedChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");
  const chatInputMode = useUIStore((s) => s.chatInputMode);
  const setChatInputMode = useUIStore((s) => s.setChatInputMode);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 80)}px`;
  }, [inputValue]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isLoading) return;

    if (chatInputMode === "search") {
      void performSearch(inputValue.trim());
    } else {
      onSendMessage(inputValue);
    }
    setInputValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [inputValue, isLoading, chatInputMode, onSendMessage]);

  const performSearch = async (query: string) => {
    setSearchLoading(true);
    setShowResults(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, limit: 8 }),
      });
      if (!res.ok) throw new Error("Search failed");
      const json = await res.json();
      const papers = (json.data?.papers ?? []) as PaperMetadata[];
      setSearchResults(
        papers.map((p) => ({
          id: p.id,
          title: p.title,
          authors: p.authors.map((a) => a.name).join(", "),
          year: p.year,
          url: p.url,
          snippet: p.abstract?.slice(0, 120),
          source: p.externalIds?.arxivId ? "arXiv" : "Semantic Scholar",
        }))
      );
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAddToGraph = useCallback(
    async (result: SearchResultItem) => {
      try {
        await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: result.title, limit: 1, addToGraph: true }),
        });
      } catch {
        // Silently fail - the main search route might not support addToGraph
      }
      setSearchResults((prev) => prev.filter((r) => r.id !== result.id));
    },
    []
  );

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

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[600px] max-w-[calc(100%-2rem)]">
      {/* Search results popover */}
      {showResults && chatInputMode === "search" && (searchResults.length > 0 || searchLoading) && (
        <div className="mb-2 bg-white rounded-xl border border-[#e8e7e2] shadow-lg max-h-[300px] overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#e8e7e2]">
            <span className="text-xs font-medium text-[#57534e]">
              {searchLoading ? "Searching..." : `${searchResults.length} results`}
            </span>
            <button onClick={() => setShowResults(false)} className="text-[#78716c] hover:text-[#44403c]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {searchLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin text-[#78716c]" />
            </div>
          ) : (
            searchResults.map((result) => (
              <div
                key={result.id}
                className="flex items-start gap-2 px-3 py-2 hover:bg-[#f3f2ee]/60 border-b border-[#e8e7e2]/50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#1c1917] line-clamp-1">{result.title}</p>
                  <p className="text-[10px] text-[#78716c] truncate">
                    {result.authors} {result.year ? `(${result.year})` : ""} -- {result.source}
                  </p>
                </div>
                <button
                  onClick={() => handleAddToGraph(result)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-[#7c3aed] bg-[#ede9fe] hover:bg-[#ddd6fe] transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>
            ))
          )}
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
          disabled={isLoading || !inputValue.trim()}
          className={cn(
            "shrink-0 p-1.5 rounded-lg transition-colors mb-0.5",
            inputValue.trim() && !isLoading
              ? "text-[#57534e] hover:bg-[#f3f2ee]"
              : "text-[#a8a29e] cursor-not-allowed"
          )}
        >
          {isLoading || searchLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Open full chat hint */}
      {chatInputMode === "chat" && (
        <div className="text-center mt-1">
          <button
            onClick={() => setCurrentView("chat")}
            className="text-[10px] text-[#a8a29e] hover:text-[#78716c] transition-colors"
          >
            Open full chat view
          </button>
        </div>
      )}
    </div>
  );
}
