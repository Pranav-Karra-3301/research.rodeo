"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import { cn } from "@/lib/utils";
import { sanitizeAbstractText } from "@/lib/utils";
import type { PaperNode } from "@/types";

const PAPER_PROMPTS = [
  "Explain this paper",
  "Key contributions",
  "Limitations",
  "Compare to related work",
];

const URL_PROMPTS = [
  "Summarize this",
  "Key points",
  "What's the argument?",
  "Any weaknesses?",
];

function getMessageText(
  msg: { parts?: Array<{ type: string; text?: string }>; content?: string }
): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p): p is { type: string; text: string } =>
        p.type === "text" && typeof (p as { text?: string }).text === "string"
      )
      .map((p) => (p as { text: string }).text)
      .join("");
  }
  return "";
}

function isToolMessage(
  msg: { parts?: Array<{ type: string }>; role?: string }
): boolean {
  if (!Array.isArray(msg.parts)) return false;
  return msg.parts.some(
    (p) => p.type === "tool-invocation" || p.type === "tool-result"
  );
}

interface Props {
  node: PaperNode;
}

export function ReaderAskAiTab({ node }: Props) {
  const [aiInput, setAiInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const systemContent = useMemo(() => {
    if (node.data.isUrlSource) {
      const descRaw = node.data.siteDescription ?? node.data.abstract;
      const desc = descRaw ? sanitizeAbstractText(descRaw) : undefined;
      const hasPrefetched = Boolean(node.data.fetchedContent);
      return [
        `You are helping the user understand a web source they've added to their graph.`,
        `Title: "${node.data.title}"`,
        `URL: ${node.data.url ?? "N/A"}`,
        desc ? `Description: ${desc}` : null,
        hasPrefetched
          ? `Full content has been pre-fetched below. Use it to answer questions directly without calling fetchUrlContent.\n\n---\n${node.data.fetchedContent}${node.data.contentTruncated ? "\n\n[Content truncated]" : ""}\n---`
          : `If you need to read its full content, use the fetchUrlContent tool with the URL above.`,
        `Do not demand an abstract or treat this as an academic paper.`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    const hasPrefetched = Boolean(node.data.fetchedContent);
    const cleanAbstract = node.data.abstract
      ? sanitizeAbstractText(node.data.abstract)
      : undefined;
    return [
      `You are analyzing the source: "${node.data.title}".`,
      cleanAbstract ? `Abstract: ${cleanAbstract}` : null,
      node.data.url ? `URL: ${node.data.url}` : null,
      hasPrefetched
        ? `Pre-fetched content:\n\n---\n${node.data.fetchedContent}${node.data.contentTruncated ? "\n\n[Content truncated]" : ""}\n---`
        : `If you need to read more content, use the fetchUrlContent tool.`,
    ]
      .filter(Boolean)
      .join("\n");
  }, [node]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: {
          projectContext: [systemContent],
        },
      }),
    [systemContent]
  );

  const { messages, sendMessage, status } = useChat({ transport });

  const aiLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // #region agent log
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    const parts = (lastAssistant as { parts?: Array<{ type: string; text?: string }> }).parts ?? [];
    const textParts = parts.filter((p) => p.type === "text");
    const toolParts = parts.filter((p) => p.type === "tool-invocation" || p.type === "tool-result");
    const fullText = getMessageText(lastAssistant);
    fetch("http://127.0.0.1:7747/ingest/61a94231-b97c-4e77-b04f-0c368daa3686", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "efdc53" },
      body: JSON.stringify({
        sessionId: "efdc53",
        location: "ReaderAskAiTab.tsx:messages",
        message: "client-messages",
        data: {
          hypothesisId: "H4",
          textPartCount: textParts.length,
          toolPartCount: toolParts.length,
          fullTextLen: fullText?.length ?? 0,
          fullTextPreview: fullText?.slice(0, 120) ?? "",
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }, [messages]);
  // #endregion

  const handleAiSend = useCallback(
    (prompt?: string) => {
      const msg = prompt ?? aiInput.trim();
      if (!msg || aiLoading) return;
      setAiInput("");
      sendMessage({ text: msg });
    },
    [aiInput, aiLoading, sendMessage]
  );

  const quickPrompts = node.data.isUrlSource ? URL_PROMPTS : PAPER_PROMPTS;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 flex flex-wrap gap-1.5">
        {quickPrompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => handleAiSend(prompt)}
            disabled={aiLoading}
            className="bg-[#f3f2ee] text-[#44403c] rounded-full px-3 py-1 text-xs hover:bg-[#eeeee8] transition-colors disabled:opacity-50"
          >
            {prompt}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {messages
            .filter((m) => m.role !== "system" && !isToolMessage(m))
            .map((msg, i) => {
              const text = getMessageText(msg);
              const isUser = msg.role === "user";
              const isLast = i === messages.filter((m) => m.role !== "system" && !isToolMessage(m)).length - 1;

              if (!text && !isUser) return null;

              return (
                <div
                  key={"id" in msg && msg.id ? String(msg.id) : i}
                  className={cn(
                    "rounded-lg p-3",
                    isUser
                      ? "bg-violet-500/10 text-[#1c1917] ml-8 text-sm leading-relaxed"
                      : "bg-white text-[#44403c] mr-2 border border-[#f0efeb]"
                  )}
                >
                  {isUser ? (
                    <span className="whitespace-pre-wrap">{text}</span>
                  ) : (
                    <>
                      <MarkdownRenderer content={text} className="text-sm" />
                      {isLast && aiLoading && (
                        <span className="inline-block w-1.5 h-3.5 bg-[#57534e] animate-pulse rounded-sm ml-0.5 align-text-bottom" />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          {aiLoading && messages.filter((m) => m.role === "assistant").length === 0 && (
            <div className="flex items-center gap-2 bg-white text-[#78716c] text-xs rounded-lg p-3 mr-2 border border-[#f0efeb]">
              <Loader2 className="w-3 h-3 animate-spin text-violet-500/60 shrink-0" />
              Thinking…
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="px-4 py-3 border-t border-[#e8e7e2]">
        <div className="flex gap-2">
          <input
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAiSend()}
            placeholder={node.data.isUrlSource ? "Ask about this source..." : "Ask about this paper..."}
            disabled={aiLoading}
            className="flex-1 bg-white border border-[#dddcd7] rounded-lg px-3 py-2 text-sm text-[#44403c] placeholder:text-[#a8a29e] focus:outline-none focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
          />
          <Button
            variant="default"
            size="sm"
            onClick={() => handleAiSend()}
            disabled={aiLoading || !aiInput.trim()}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
