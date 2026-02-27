"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { UIMessage } from "ai";
import { ChevronDown, Loader2, Plus, Send, Sparkles } from "lucide-react";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";
import type {
  Author,
  EdgeType,
  EvidenceCard,
  ExternalIds,
  GraphCommandIntent,
  PaperMetadata,
  ScopeQuestion,
} from "@/types";
import { useGraphStore } from "@/store/graph-store";
import { newRabbitHoleId, useRabbitHoleStore } from "@/store/rabbit-hole-store";
import { useChatStore } from "@/store/chat-store";
import { EMPTY_WORKFLOW_SNAPSHOT, useWorkflowStore } from "@/store/workflow-store";
import { executeGraphCommand } from "@/lib/graph/commands";
import {
  createChatThread,
  parseChatMessage,
  renameChatThread,
  upsertChatMessage,
} from "@/lib/db/chat-actions";
import { assembleContext } from "@/lib/agents/context";
import { MarkdownRenderer } from "./MarkdownRenderer";

type ToolCallShape = {
  dynamic?: boolean;
  toolName: string;
  toolCallId: string;
  input: unknown;
};

const CONNECT_EDGE_TYPES: readonly EdgeType[] = [
  "cites",
  "cited-by",
  "semantic-similarity",
  "same-author",
  "same-dataset",
  "methodologically-similar",
  "contradicts",
  "extends",
  "same-venue",
];

function isEdgeType(value: unknown): value is EdgeType {
  return typeof value === "string" && CONNECT_EDGE_TYPES.includes(value as EdgeType);
}

function getText(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getToolParts(msg: UIMessage) {
  return msg.parts.filter(
    (p): p is Extract<UIMessage["parts"][number], { type: "tool-invocation" }> =>
      p.type === "tool-invocation"
  );
}

const TOOL_LABELS: Record<string, string> = {
  searchPapers: "Searching for sources",
  expandPaper: "Expanding source",
  addGraphNode: "Adding to graph",
  connectGraphNodes: "Connecting nodes",
  expandGraphNode: "Expanding node",
  getPaperDetails: "Getting details",
  summarizeCluster: "Summarizing cluster",
  findContradictions: "Finding contradictions",
};

function parseAuthors(input: unknown): Author[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((author, i) => {
      if (typeof author === "string") {
        return { id: `a-${i}`, name: author };
      }
      if (author && typeof author === "object") {
        const raw = author as Record<string, unknown>;
        const name =
          typeof raw.name === "string"
            ? raw.name
            : typeof raw.author === "string"
              ? raw.author
              : "";
        if (!name) return null;
        return {
          id: typeof raw.id === "string" ? raw.id : `a-${i}`,
          name,
        };
      }
      return null;
    })
    .filter((a): a is Author => a != null);
}

function parseExternalIds(input: unknown): ExternalIds {
  const out: ExternalIds = {};
  if (!input || typeof input !== "object") return out;
  const raw = input as Record<string, unknown>;
  if (typeof raw.doi === "string") out.doi = raw.doi;
  if (typeof raw.arxivId === "string") out.arxivId = raw.arxivId;
  if (typeof raw.semanticScholarId === "string") out.semanticScholarId = raw.semanticScholarId;
  if (typeof raw.corpusId === "string") out.corpusId = raw.corpusId;
  if (typeof raw.openAlexId === "string") out.openAlexId = raw.openAlexId;
  if (typeof raw.pubmedId === "string") out.pubmedId = raw.pubmedId;
  return out;
}

function normalizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  try {
    const url = new URL(value.trim());
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function firstUrl(...values: unknown[]): string | undefined {
  for (const value of values) {
    const parsed = normalizeUrl(value);
    if (parsed) return parsed;
  }
  return undefined;
}

function stableUrlNodeId(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) + hash) ^ url.charCodeAt(i);
  }
  return `url-${(hash >>> 0).toString(36)}`;
}

function inferSiteName(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function paperFromToolResult(item: Record<string, unknown>): PaperMetadata {
  const metadata =
    item.metadata && typeof item.metadata === "object"
      ? (item.metadata as Record<string, unknown>)
      : undefined;
  const url = firstUrl(
    item.url,
    item.sourceUrl,
    item.link,
    item.source,
    metadata?.url,
    item.openAccessPdf,
    item.pdfUrl
  );
  const openAccessPdf = firstUrl(item.openAccessPdf, item.pdfUrl, metadata?.openAccessPdf);
  const id =
    typeof item.id === "string" && item.id.trim().length > 0
      ? item.id
      : url
        ? stableUrlNodeId(url)
        : `paper-${nanoid(10)}`;
  const title = String(item.title ?? "Untitled");
  const authors = parseAuthors(item.authors);
  const year = typeof item.year === "number" ? item.year : undefined;
  const abstract =
    typeof item.abstract === "string"
      ? item.abstract
      : typeof item.snippet === "string"
        ? item.snippet
        : undefined;
  const citationCount = typeof item.citationCount === "number" ? item.citationCount : 0;
  const referenceCount = typeof item.referenceCount === "number" ? item.referenceCount : 0;
  const externalIds = parseExternalIds(item.externalIds ?? metadata?.externalIds);
  const venue = typeof item.venue === "string" ? item.venue : undefined;
  const siteName =
    typeof item.siteName === "string"
      ? item.siteName
      : typeof metadata?.siteName === "string"
        ? metadata.siteName
        : inferSiteName(url);
  const siteDescription =
    typeof item.siteDescription === "string"
      ? item.siteDescription
      : typeof metadata?.description === "string"
        ? metadata.description
        : abstract;
  const isUrlSource =
    Boolean(url) &&
    !externalIds.semanticScholarId &&
    !externalIds.doi &&
    !externalIds.arxivId &&
    citationCount === 0 &&
    referenceCount === 0;

  return {
    id,
    externalIds,
    title,
    authors,
    year,
    abstract,
    venue,
    citationCount,
    referenceCount,
    url,
    openAccessPdf: openAccessPdf ?? (url && /\.pdf(\?|#|$)/i.test(url) ? url : undefined),
    siteName,
    siteDescription,
    isUrlSource,
  };
}

function toPaper(input: Record<string, unknown>): PaperMetadata {
  const title = String(input.title ?? "Untitled source");
  const metadata =
    input.metadata && typeof input.metadata === "object"
      ? (input.metadata as Record<string, unknown>)
      : undefined;
  const url = firstUrl(
    input.url,
    input.sourceUrl,
    input.link,
    input.source,
    metadata?.url,
    input.openAccessPdf,
    input.pdfUrl
  );
  const externalIds = parseExternalIds(input.externalIds);
  const paperId =
    typeof input.paperId === "string" && input.paperId.trim().length > 0
      ? input.paperId
      : undefined;
  const id =
    paperId
      ? paperId
      : url
        ? stableUrlNodeId(url)
        : `title:${title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60)}`;
  const authors = parseAuthors(input.authors);
  const year = typeof input.year === "number" ? input.year : undefined;
  const citationCount = typeof input.citationCount === "number" ? input.citationCount : 0;
  const referenceCount = typeof input.referenceCount === "number" ? input.referenceCount : 0;
  const snippet =
    typeof input.snippet === "string"
      ? input.snippet
      : typeof input.abstract === "string"
        ? input.abstract
        : undefined;
  const openAccessPdf = firstUrl(input.openAccessPdf, input.pdfUrl, metadata?.openAccessPdf);
  const siteName =
    typeof input.siteName === "string"
      ? input.siteName
      : typeof metadata?.siteName === "string"
        ? metadata.siteName
        : inferSiteName(url);
  const isUrlSource =
    Boolean(url) &&
    !paperId &&
    !externalIds.semanticScholarId &&
    !externalIds.doi &&
    !externalIds.arxivId;

  return {
    id,
    externalIds,
    title,
    authors,
    year,
    citationCount,
    referenceCount,
    url,
    venue: typeof input.venue === "string" ? input.venue : undefined,
    openAccessPdf: openAccessPdf ?? (url && /\.pdf(\?|#|$)/i.test(url) ? url : undefined),
    abstract: snippet,
    siteDescription: snippet,
    siteName,
    isUrlSource,
  };
}

function intentFromToolCall(toolCall: ToolCallShape): {
  summary: string;
  intent: GraphCommandIntent;
} | null {
  const input = (toolCall.input ?? {}) as Record<string, unknown>;

  switch (toolCall.toolName) {
    case "addGraphNode": {
      const paper = toPaper(input);
      return {
        summary: `Add source: ${paper.title}`,
        intent: {
          type: "add-node",
          paper,
          materialize: true,
          source: "chat",
        },
      };
    }
    case "connectGraphNodes": {
      if (typeof input.sourceId !== "string" || typeof input.targetId !== "string") {
        return null;
      }
      return {
        summary: `Connect ${input.sourceId} -> ${input.targetId}`,
        intent: {
          type: "connect-nodes",
          sourceId: input.sourceId,
          targetId: input.targetId,
          edgeType: isEdgeType(input.edgeType) ? input.edgeType : "semantic-similarity",
          evidence: typeof input.reason === "string" ? input.reason : undefined,
          source: "chat",
        },
      };
    }
    case "expandGraphNode": {
      if (typeof input.nodeId !== "string") return null;
      return {
        summary: `Expand ${input.nodeId}`,
        intent: {
          type: "expand-node",
          nodeId: input.nodeId,
          mode:
            input.mode === "foundational" ||
            input.mode === "recent" ||
            input.mode === "contrasting"
              ? input.mode
              : "foundational",
          budget: typeof input.budget === "number" ? input.budget : undefined,
          source: "chat",
        },
      };
    }
    case "mergeGraphClusters": {
      if (typeof input.clusterIdA !== "string" || typeof input.clusterIdB !== "string") {
        return null;
      }
      return {
        summary: "Merge clusters",
        intent: {
          type: "merge-clusters",
          clusterIdA: input.clusterIdA,
          clusterIdB: input.clusterIdB,
          source: "chat",
        },
      };
    }
    case "archiveGraphNode": {
      if (typeof input.nodeId !== "string") return null;
      return {
        summary: `Archive ${input.nodeId}`,
        intent: {
          type: "archive-node",
          nodeId: input.nodeId,
          source: "chat",
        },
      };
    }
    case "relayoutGraph": {
      return {
        summary: "Relayout graph",
        intent: {
          type: "relayout",
          source: "chat",
        },
      };
    }
    case "addContradictionCard": {
      const title = typeof input.title === "string" ? input.title : "Contradiction source";
      return {
        summary: "Add contradiction",
        intent: {
          type: "add-contradiction",
          anchorNodeId: typeof input.anchorNodeId === "string" ? input.anchorNodeId : undefined,
          title,
          url: typeof input.url === "string" ? input.url : undefined,
          snippet: typeof input.snippet === "string" ? input.snippet : undefined,
          evidenceCardId:
            typeof input.evidenceCardId === "string" ? input.evidenceCardId : undefined,
          source: "chat",
        },
      };
    }
    case "saveCardForLater": {
      if (typeof input.evidenceCardId !== "string") return null;
      return {
        summary: "Save evidence card",
        intent: {
          type: "save-for-later",
          evidenceCardId: input.evidenceCardId,
          source: "chat",
        },
      };
    }
    default:
      return null;
  }
}

function ScopeQuestionCard({
  question,
  value,
  onChange,
}: {
  question: ScopeQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-lg border border-[#e8e7e2] bg-white p-2.5">
      <p className="text-xs font-medium text-[#1c1917]">{question.question}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Your answer..."
        className="mt-2 h-8 w-full rounded-md border border-[#dddcd7] bg-[#fafaf9] px-2 text-xs text-[#1c1917] outline-none focus:border-[#c8c7c2] focus:bg-[#f3f2ee]"
      />
    </div>
  );
}

function PaperResultRow({
  paper,
  onAddToGraph,
  adding,
  added,
}: {
  paper: PaperMetadata;
  onAddToGraph: () => void;
  adding: boolean;
  added: boolean;
}) {
  const authorLine = paper.authors.length > 0 ? paper.authors.map((a) => a.name).join(", ") : "";

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[#e8e7e2] bg-[#fafaf9] px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[#1c1917] truncate">{paper.title}</p>
        {(authorLine || paper.year !== undefined) && (
          <p className="mt-0.5 text-[10px] text-[#78716c] truncate">
            {[authorLine, paper.year].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onAddToGraph}
        disabled={adding || added}
        className={cn(
          "h-7 w-[96px] shrink-0 rounded-md text-[10px] font-medium transition-colors",
          added
            ? "bg-[#e7f3ec] text-[#2f6f45]"
            : adding
              ? "bg-[#ecebe6] text-[#78716c]"
              : "bg-[#1f1d19] text-white hover:bg-[#11100e]"
        )}
      >
        {added ? "Added" : adding ? "Adding..." : "Add to graph"}
      </button>
    </div>
  );
}

function EvidenceCardView({
  card,
  onAdd,
  onContradiction,
  onSave,
}: {
  card: EvidenceCard;
  onAdd: () => void;
  onContradiction: () => void;
  onSave: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#e8e7e2] bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[#78716c]">
            Layer {card.layer} · {card.type}
          </p>
          <p className="text-sm font-medium text-[#1c1917] leading-snug">{card.title}</p>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium",
            card.confidence === "high" && "bg-emerald-100 text-emerald-700",
            card.confidence === "medium" && "bg-amber-100 text-amber-700",
            card.confidence === "low" && "bg-stone-100 text-stone-700"
          )}
        >
          {card.confidence}
        </span>
      </div>
      {card.snippet && <p className="mt-2 text-xs text-[#57534e] line-clamp-3">{card.snippet}</p>}
      {card.url && (
        <a
          href={card.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block truncate text-xs text-[#44403c] hover:underline"
        >
          {card.url}
        </a>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={onAdd}
          className="h-7 w-[112px] rounded-md bg-[#1f1d19] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#11100e]"
        >
          Add to graph
        </button>
        <button
          onClick={onContradiction}
          className="h-7 rounded-md border border-[#dddcd7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#44403c] hover:bg-[#f8f7f4]"
        >
          Contradiction
        </button>
        <button
          onClick={onSave}
          className="h-7 rounded-md border border-[#dddcd7] bg-white px-2.5 py-1 text-[11px] font-medium text-[#44403c] hover:bg-[#f8f7f4]"
        >
          Save for later
        </button>
      </div>
    </div>
  );
}

export function ChatDock() {
  const activeRabbitHoleId = useRabbitHoleStore((s) => s.currentRabbitHoleId);
  const setCurrentRabbitHoleId = useRabbitHoleStore((s) => s.setCurrentRabbitHoleId);
  const dbConnection = useRabbitHoleStore((s) => s.dbConnection);

  const nodeCount = useGraphStore((s) => s.nodes.size);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const clusters = useGraphStore((s) => s.clusters);
  const query = useGraphStore((s) => s.query);

  const workflowActiveRabbitHoleId = useWorkflowStore((s) => s.activeRabbitHoleId);
  const setActiveRabbitHole = useWorkflowStore((s) => s.setActiveRabbitHole);
  const setQuestion = useWorkflowStore((s) => s.setQuestion);
  const setOnboardingStep = useWorkflowStore((s) => s.setOnboardingStep);
  const setScopeQuestions = useWorkflowStore((s) => s.setScopeQuestions);
  const setScopeAnswer = useWorkflowStore((s) => s.setScopeAnswer);
  const setLayerStatus = useWorkflowStore((s) => s.setLayerStatus);
  const setEvidenceCards = useWorkflowStore((s) => s.setEvidenceCards);
  const setEvidenceCardStatus = useWorkflowStore((s) => s.setEvidenceCardStatus);
  const setEvidenceCardLinkedNode = useWorkflowStore((s) => s.setEvidenceCardLinkedNode);
  const addPendingAction = useWorkflowStore((s) => s.addPendingAction);
  const removePendingAction = useWorkflowStore((s) => s.removePendingAction);
  const workflow = useWorkflowStore((s) => {
    const holeId = s.activeRabbitHoleId;
    return holeId ? s.byHole[holeId] ?? EMPTY_WORKFLOW_SNAPSHOT : EMPTY_WORKFLOW_SNAPSHOT;
  });

  const holeChat = useChatStore((s) =>
    activeRabbitHoleId ? s.byHole[activeRabbitHoleId] : undefined
  );
  const setActiveThread = useChatStore((s) => s.setActiveThread);
  const setDraft = useChatStore((s) => s.setDraft);
  const getDraft = useChatStore((s) => s.getDraft);

  const threads = holeChat?.threads ?? [];
  const activeThreadId = holeChat?.activeThreadId ?? null;
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;
  const threadRecords = useMemo(() => {
    if (!activeThreadId) return [];
    return holeChat?.messagesByThread[activeThreadId] ?? [];
  }, [holeChat, activeThreadId]);

  const persistedMessages = useMemo(
    () =>
      threadRecords
        .map((r) => parseChatMessage(r))
        .filter((m): m is UIMessage => m != null),
    [threadRecords]
  );

  const [inputValue, setInputValue] = useState("");
  const [busyOnboarding, setBusyOnboarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);
  const [addingPaperIds, setAddingPaperIds] = useState<Set<string>>(new Set());
  const [addedPaperIds, setAddedPaperIds] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);

  const localRabbitHoleRef = useRef<string | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const weights = useMemo(
    () => ({
      influence: 0.2,
      recency: 0.2,
      semanticSimilarity: 0.3,
      localCentrality: 0.2,
      velocity: 0.1,
    }),
    []
  );

  useEffect(() => {
    setActiveRabbitHole(activeRabbitHoleId);
  }, [activeRabbitHoleId, setActiveRabbitHole]);

  useEffect(() => {
    if (!activeRabbitHoleId) return;
    if (threads.length > 0) return;
    createChatThread({ rabbitHoleId: activeRabbitHoleId, title: "New chat" });
  }, [activeRabbitHoleId, threads.length]);

  useEffect(() => {
    if (!activeRabbitHoleId || !activeThreadId) {
      setInputValue("");
      return;
    }
    setInputValue(getDraft(activeRabbitHoleId, activeThreadId));
  }, [activeRabbitHoleId, activeThreadId, getDraft]);

  const projectContext = useMemo(() => {
    const nodeArr = Array.from(nodes.values());
    return assembleContext(
      {
        rootQuery: query || workflow.question || "research exploration",
        weights,
        nodes: nodeArr,
        clusters,
      },
      ""
    );
  }, [clusters, nodes, query, workflow.question, weights]);

  const workflowContext = useMemo(() => {
    const answers = Object.entries(workflow.scopeAnswers)
      .filter(([, value]) => value.trim().length > 0)
      .map(([id, value]) => `${id}: ${value}`)
      .join("\n");
    return [
      "## Rabbit Hole Workflow",
      `Question: ${workflow.question || "N/A"}`,
      `Layers: ${JSON.stringify(workflow.layerStatus)}`,
      answers ? `Scope Answers:\n${answers}` : "Scope Answers: none",
      `Evidence Cards: ${workflow.evidenceCards.length}`,
    ].join("\n");
  }, [workflow]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: {
          rabbitHoleId: activeRabbitHoleId,
          threadId: activeThreadId,
          selectedNodeId,
          projectContext: [...projectContext, workflowContext],
        },
      }),
    [
      activeRabbitHoleId,
      activeThreadId,
      selectedNodeId,
      projectContext,
      workflowContext,
    ]
  );

  const { messages, sendMessage, status, addToolOutput } = useChat({
    id: activeThreadId ?? undefined,
    messages: persistedMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      const mapped = intentFromToolCall(toolCall as ToolCallShape);
      if (!mapped) return;
      addPendingAction({
        id: `pending-${toolCall.toolCallId}`,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        summary: mapped.summary,
        intent: mapped.intent,
      });
    },
  });

  useEffect(() => {
    if (!activeRabbitHoleId || !activeThreadId) return;

    for (const [index, message] of messages.entries()) {
      upsertChatMessage({
        rabbitHoleId: activeRabbitHoleId,
        threadId: activeThreadId,
        message,
        seq: index,
      });
    }

    const firstUser = messages.find((m) => m.role === "user");
    const firstUserText = firstUser ? getText(firstUser).trim() : "";
    if (
      firstUserText &&
      activeThread &&
      (!activeThread.title || activeThread.title === "New chat")
    ) {
      renameChatThread(
        activeThreadId,
        firstUserText.slice(0, 60),
        activeRabbitHoleId
      );
    }
  }, [messages, activeRabbitHoleId, activeThreadId, activeThread]);

  useEffect(() => {
    if (!autoScroll) return;
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
    setAutoScroll(nearBottom);
  }, []);

  const isLoading = status === "submitted" || status === "streaming";
  const needsOnboarding = nodeCount === 0 && !workflow.question.trim();
  const hasScopeQuestions = workflow.scopeQuestions.length > 0;

  const fetchScopeQuestions = useCallback(async (question: string) => {
    const res = await fetch("/api/onboarding/scope", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const json = (await res.json()) as {
      status: "success" | "error";
      data?: { questions: ScopeQuestion[] };
      error?: string;
    };
    if (!res.ok || json.status !== "success" || !json.data) {
      throw new Error(json.error ?? "Failed to generate scope questions");
    }
    return json.data.questions;
  }, []);

  const ensureRabbitHole = useCallback(
    async (seedQuestion: string): Promise<string> => {
      if (activeRabbitHoleId) {
        setActiveRabbitHole(activeRabbitHoleId);
        return activeRabbitHoleId;
      }

      if (dbConnection) {
        const newId = newRabbitHoleId();
        dbConnection.reducers.createRabbitHole({
          id: newId,
          name: seedQuestion.slice(0, 60) || "Rabbit Hole",
          rootQuery: seedQuestion,
        });
        setCurrentRabbitHoleId(newId);
        setActiveRabbitHole(newId);
        return newId;
      }

      if (!localRabbitHoleRef.current) {
        localRabbitHoleRef.current = `local-${nanoid(8)}`;
      }
      setActiveRabbitHole(localRabbitHoleRef.current);
      return localRabbitHoleRef.current;
    },
    [activeRabbitHoleId, dbConnection, setActiveRabbitHole, setCurrentRabbitHoleId]
  );

  const fetchEvidence = useCallback(
    async (layer: 1 | 2 | 3) => {
      if (!workflow.question.trim()) return;
      setBusyOnboarding(true);
      setError(null);
      setOnboardingStep("evidence_loading");
      try {
        const res = await fetch("/api/onboarding/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: workflow.question,
            layer,
            scopeAnswers: workflow.scopeAnswers,
            limit: 8,
          }),
        });
        const json = (await res.json()) as {
          status: "success" | "error";
          data?: {
            cards: Array<{
              id: string;
              layer: 1 | 2 | 3;
              type: "source" | "contradiction" | "gap";
              title: string;
              url?: string;
              snippet?: string;
              confidence: "high" | "medium" | "low";
              citations: Array<{ title?: string; url: string; snippet?: string }>;
              paper?: PaperMetadata;
            }>;
          };
          error?: string;
        };
        if (!res.ok || json.status !== "success" || !json.data) {
          throw new Error(json.error ?? "Failed to fetch evidence");
        }

        const rabbitHoleId = workflowActiveRabbitHoleId ?? activeRabbitHoleId ?? "local";
        const now = Date.now();
        const cards: EvidenceCard[] = json.data.cards.map((card) => ({
          id: card.id,
          rabbitHoleId,
          layer: card.layer,
          type: card.type,
          status: "new",
          title: card.title,
          url: card.url,
          snippet: card.snippet,
          confidence: card.confidence,
          citations: card.citations,
          payload: { paper: card.paper },
          createdAt: now,
          updatedAt: now,
        }));

        if (layer === 1) setEvidenceCards(cards);
        else setEvidenceCards([...workflow.evidenceCards, ...cards]);

        setLayerStatus(0, "completed");
        setLayerStatus(1, layer >= 1 ? "active" : workflow.layerStatus[1]);
        if (layer >= 2) setLayerStatus(2, "active");
        if (layer >= 3) setLayerStatus(3, "active");
        setOnboardingStep("evidence_review");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch evidence");
        setOnboardingStep("scope_questions");
      } finally {
        setBusyOnboarding(false);
      }
    },
    [
      activeRabbitHoleId,
      workflowActiveRabbitHoleId,
      setEvidenceCards,
      setLayerStatus,
      setOnboardingStep,
      workflow.evidenceCards,
      workflow.layerStatus,
      workflow.question,
      workflow.scopeAnswers,
    ]
  );

  const startOnboarding = useCallback(async () => {
    const msg = inputValue.trim();
    if (!msg || busyOnboarding) return;
    try {
      setBusyOnboarding(true);
      setError(null);
      const holeId = await ensureRabbitHole(msg);
      setQuestion(msg);
      setLayerStatus(0, "active");
      setOnboardingStep("scope_questions");
      const questions = await fetchScopeQuestions(msg);
      setScopeQuestions(questions);
      const thread = createChatThread({ rabbitHoleId: holeId, title: "New chat" });
      if (thread) {
        setActiveThread(holeId, thread.id);
      }
      setInputValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start onboarding");
    } finally {
      setBusyOnboarding(false);
    }
  }, [
    busyOnboarding,
    ensureRabbitHole,
    fetchScopeQuestions,
    inputValue,
    setLayerStatus,
    setOnboardingStep,
    setQuestion,
    setScopeQuestions,
    setActiveThread,
  ]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;
    setError(null);

    if (needsOnboarding) {
      await startOnboarding();
      return;
    }

    if (!activeThreadId || !activeRabbitHoleId) return;

    sendMessage({ text });
    setInputValue("");
    setDraft(activeRabbitHoleId, activeThreadId, "");
  }, [
    inputValue,
    needsOnboarding,
    startOnboarding,
    activeThreadId,
    activeRabbitHoleId,
    sendMessage,
    setDraft,
  ]);

  const handleNewChat = useCallback(() => {
    if (!activeRabbitHoleId) return;
    const thread = createChatThread({
      rabbitHoleId: activeRabbitHoleId,
      title: "New chat",
    });
    if (!thread) return;
    setActiveThread(activeRabbitHoleId, thread.id);
    setInputValue("");
    setDraft(activeRabbitHoleId, thread.id, "");
  }, [activeRabbitHoleId, setActiveThread, setDraft]);

  const handleApplyPending = useCallback(
    async (pendingId: string) => {
      const pending = workflow.pendingActions.find((action) => action.id === pendingId);
      if (!pending) return;
      const result = await executeGraphCommand(pending.intent);
      if (!result.applied) {
        await addToolOutput({
          state: "output-error",
          tool: pending.toolName as never,
          toolCallId: pending.toolCallId,
          errorText: result.error ?? "Failed to apply action",
        });
      } else {
        await addToolOutput({
          tool: pending.toolName as never,
          toolCallId: pending.toolCallId,
          output: {
            ok: true,
            summary: result.summary,
            addedNodeIds: result.addedNodeIds,
            addedEdgeIds: result.addedEdgeIds,
          } as never,
        });
      }
      removePendingAction(pending.id);
    },
    [addToolOutput, removePendingAction, workflow.pendingActions]
  );

  const handleRejectPending = useCallback(
    async (pendingId: string) => {
      const pending = workflow.pendingActions.find((action) => action.id === pendingId);
      if (!pending) return;
      await addToolOutput({
        tool: pending.toolName as never,
        toolCallId: pending.toolCallId,
        output: {
          ok: false,
          rejected: true,
        } as never,
      });
      removePendingAction(pending.id);
    },
    [addToolOutput, removePendingAction, workflow.pendingActions]
  );

  const handleAddCardToGraph = useCallback(
    async (card: EvidenceCard) => {
      const paper = (card.payload?.paper ?? null) as PaperMetadata | null;
      if (!paper) return;
      const result = await executeGraphCommand({
        type: "add-node",
        paper,
        materialize: true,
        evidenceCardId: card.id,
        source: "chat",
      });
      if (result.applied && result.addedNodeIds?.[0]) {
        setEvidenceCardStatus(card.id, "added");
        setEvidenceCardLinkedNode(card.id, result.addedNodeIds[0]);
      }
    },
    [setEvidenceCardLinkedNode, setEvidenceCardStatus]
  );

  const handleCardContradiction = useCallback(
    async (card: EvidenceCard) => {
      const paper = (card.payload?.paper ?? null) as PaperMetadata | null;
      const result = await executeGraphCommand({
        type: "add-contradiction",
        anchorNodeId: selectedNodeId ?? undefined,
        paper: paper ?? undefined,
        title: card.title,
        url: card.url,
        snippet: card.snippet,
        evidenceCardId: card.id,
        source: "chat",
      });
      if (result.applied) {
        setEvidenceCardStatus(card.id, "contradiction");
      }
    },
    [selectedNodeId, setEvidenceCardStatus]
  );

  const handleCardSave = useCallback(
    async (card: EvidenceCard) => {
      await executeGraphCommand({
        type: "save-for-later",
        evidenceCardId: card.id,
        source: "chat",
      });
      setEvidenceCardStatus(card.id, "saved");
    },
    [setEvidenceCardStatus]
  );

  const handleAddPaper = useCallback(async (paper: PaperMetadata) => {
    const key = paper.id;
    setAddingPaperIds((prev) => new Set(prev).add(key));
    try {
      const result = await executeGraphCommand({
        type: "add-node",
        paper,
        materialize: true,
        source: "chat",
      });
      if (result.applied) {
        setAddedPaperIds((prev) => new Set(prev).add(key));
      }
    } finally {
      setAddingPaperIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const activityCount =
    workflow.scopeQuestions.length +
    workflow.evidenceCards.length +
    workflow.pendingActions.length +
    workflow.appliedChanges.length;

  return (
    <div className="absolute left-0 right-0 bottom-0 z-30 pointer-events-none">
      <div className="mx-auto w-full max-w-5xl px-4 pb-4">
        <div className="pointer-events-auto overflow-hidden rounded-2xl border border-[#dddcd7] bg-white/95 backdrop-blur shadow-[0_14px_50px_rgba(0,0,0,0.10)]">
          <div className="flex items-center justify-between gap-2 border-b border-[#e8e7e2] bg-[#fafaf9] px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-xs font-medium text-[#44403c]">Chat</span>
              <select
                value={activeThreadId ?? ""}
                onChange={(e) => {
                  if (!activeRabbitHoleId) return;
                  const nextId = e.target.value || null;
                  setActiveThread(activeRabbitHoleId, nextId);
                }}
                className="h-7 max-w-[220px] rounded-md border border-[#dddcd7] bg-white px-2 text-xs text-[#1c1917] outline-none"
              >
                {threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {(thread.title || "New chat").slice(0, 40)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleNewChat}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-[#dddcd7] bg-white px-2 text-[11px] font-medium text-[#44403c] hover:bg-[#f3f2ee]"
              >
                <Plus className="h-3 w-3" />
                New chat
              </button>
              <button
                onClick={() => setActivityOpen((v) => !v)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-[#dddcd7] bg-white px-2 text-[11px] font-medium text-[#44403c] hover:bg-[#f3f2ee]"
              >
                Activity
                {activityCount > 0 && (
                  <span className="rounded-full bg-[#ecebe6] px-1.5 text-[10px] text-[#57534e]">
                    {activityCount}
                  </span>
                )}
                <ChevronDown
                  className={cn("h-3 w-3 transition-transform", activityOpen && "rotate-180")}
                />
              </button>
            </div>
          </div>

          {activityOpen && (
            <div className="max-h-[32vh] overflow-y-auto border-b border-[#e8e7e2] p-3 space-y-3">
              {needsOnboarding && workflow.onboardingStep === "idle" && (
                <div className="rounded-lg border border-[#e8e7e2] bg-[#fafaf9] p-3">
                  <div className="flex items-center gap-2 text-[#44403c]">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-sm font-medium">Start a rabbit hole</p>
                  </div>
                  <p className="mt-1 text-xs text-[#78716c]">
                    Ask your core question below. I&apos;ll ask scope questions, fetch
                    evidence cards, then map decisions into the graph.
                  </p>
                </div>
              )}

              {hasScopeQuestions && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#44403c]">Layer 0 · scope</p>
                  {workflow.scopeQuestions.map((q) => (
                    <ScopeQuestionCard
                      key={q.id}
                      question={q}
                      value={workflow.scopeAnswers[q.id] ?? ""}
                      onChange={(value) => setScopeAnswer(q.id, value)}
                    />
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => void fetchEvidence(1)}
                      disabled={busyOnboarding}
                      className="h-7 rounded-md bg-[#1f1d19] px-2.5 text-[11px] font-medium text-white hover:bg-[#11100e] disabled:opacity-60"
                    >
                      Fetch Layer 1 seeds
                    </button>
                    <button
                      onClick={() => void fetchEvidence(2)}
                      disabled={busyOnboarding}
                      className="h-7 rounded-md border border-[#dddcd7] bg-white px-2.5 text-[11px] font-medium text-[#44403c] hover:bg-[#f8f7f4] disabled:opacity-60"
                    >
                      Fetch Layer 2
                    </button>
                    <button
                      onClick={() => void fetchEvidence(3)}
                      disabled={busyOnboarding}
                      className="h-7 rounded-md border border-[#dddcd7] bg-white px-2.5 text-[11px] font-medium text-[#44403c] hover:bg-[#f8f7f4] disabled:opacity-60"
                    >
                      Fetch Layer 3
                    </button>
                  </div>
                </div>
              )}

              {workflow.evidenceCards.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#44403c]">
                    Evidence cards ({workflow.evidenceCards.length})
                  </p>
                  {workflow.evidenceCards.map((card) => (
                    <EvidenceCardView
                      key={card.id}
                      card={card}
                      onAdd={() => void handleAddCardToGraph(card)}
                      onContradiction={() => void handleCardContradiction(card)}
                      onSave={() => void handleCardSave(card)}
                    />
                  ))}
                </div>
              )}

              {workflow.pendingActions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#44403c]">Proposed graph actions</p>
                  {workflow.pendingActions.map((action) => (
                    <div
                      key={action.id}
                      className="rounded-lg border border-[#e8e7e2] bg-[#fafaf9] p-2.5"
                    >
                      <p className="text-xs text-[#1c1917]">{action.summary}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => void handleApplyPending(action.id)}
                          className="h-7 rounded-md bg-[#1f1d19] px-2.5 text-[11px] font-medium text-white hover:bg-[#11100e]"
                        >
                          Apply
                        </button>
                        <button
                          onClick={() => void handleRejectPending(action.id)}
                          className="h-7 rounded-md border border-[#dddcd7] bg-white px-2.5 text-[11px] font-medium text-[#44403c] hover:bg-[#f8f7f4]"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {workflow.appliedChanges.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[#44403c]">Applied changes</p>
                  {workflow.appliedChanges.slice(0, 8).map((change) => (
                    <div
                      key={change.id}
                      className="rounded-lg border border-[#ecebe6] bg-white px-2.5 py-2"
                    >
                      <p className="text-xs text-[#1c1917]">{change.summary}</p>
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-[#a8a29e]">
                        {change.source} · {new Date(change.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-[38vh] overflow-y-auto p-3 space-y-3"
          >
            {messages.length === 0 && !isLoading && (
              <p className="text-xs text-[#78716c]">
                Ask a question, expand ideas, and add sources to your graph.
              </p>
            )}

            {messages.map((message) => {
              if (message.role === "user") {
                const text = getText(message);
                if (!text) return null;
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-xl bg-[#ecebe6] px-3 py-2 text-sm text-[#1c1917]">
                      <MarkdownRenderer content={text} />
                    </div>
                  </div>
                );
              }

              const text = getText(message);
              const toolParts = getToolParts(message);
              const hasContent = text.length > 0 || toolParts.length > 0;
              const isLast = message.id === messages[messages.length - 1]?.id;
              if (!hasContent && !(isLast && isLoading)) return null;

              return (
                <div
                  key={message.id}
                  className="rounded-xl border border-[#ecebe6] bg-[#fafaf9] px-3 py-2 space-y-2"
                >
                  {message.parts.map((part, idx) => {
                    if (part.type === "text") {
                      const t = part.text?.trim();
                      return t ? (
                        <div
                          key={`${message.id}-text-${idx}`}
                          className="text-sm text-[#1c1917] leading-relaxed"
                        >
                          <MarkdownRenderer content={t} />
                        </div>
                      ) : null;
                    }
                    if (part.type !== "tool-invocation") return null;

                    const inv = (part as {
                      toolInvocation?: {
                        toolName: string;
                        state: string;
                        result?: unknown;
                      };
                    }).toolInvocation;
                    const result = inv?.result ?? (part as { result?: unknown }).result;
                    const name = inv?.toolName ?? "unknown";
                    const state = inv?.state ?? "pending";
                    const label = TOOL_LABELS[name] ?? `Running ${name}`;

                    if (state === "output-error" || (part as { error?: string }).error) {
                      const err = (part as { error?: string }).error ?? "Tool failed";
                      return (
                        <div key={`${message.id}-tool-${idx}`} className="text-xs text-red-600">
                          {label}: {err}
                        </div>
                      );
                    }

                    if (state !== "result") {
                      return (
                        <div
                          key={`${message.id}-tool-${idx}`}
                          className="flex items-center gap-2 text-xs text-[#78716c] py-0.5"
                        >
                          <Loader2 className="h-3 w-3 animate-spin text-[#57534e]" />
                          <span>{label}…</span>
                        </div>
                      );
                    }

                    const res =
                      result && typeof result === "object"
                        ? (result as Record<string, unknown>)
                        : {};
                    const papers: Record<string, unknown>[] = Array.isArray(res.papers)
                      ? res.papers
                      : Array.isArray(res.newPapers)
                        ? res.newPapers
                        : [];
                    if (papers.length === 0) return null;

                    return (
                      <div key={`${message.id}-tool-${idx}`} className="space-y-1.5">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[#78716c]">
                          {papers.length} result{papers.length !== 1 ? "s" : ""}
                        </p>
                        {papers.map((item, i) => {
                          const paper = paperFromToolResult(item as Record<string, unknown>);
                          return (
                            <PaperResultRow
                              key={`${paper.id}-${i}`}
                              paper={paper}
                              adding={addingPaperIds.has(paper.id)}
                              added={addedPaperIds.has(paper.id)}
                              onAddToGraph={() => {
                                void handleAddPaper(paper);
                              }}
                            />
                          );
                        })}
                      </div>
                    );
                  })}

                  {!hasContent && isLast && isLoading && (
                    <div className="inline-flex items-center gap-2 rounded-md bg-[#f3f2ee] px-2 py-1 text-xs text-[#57534e]">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Thinking
                    </div>
                  )}
                </div>
              );
            })}

            {error && <p className="text-xs text-red-500">{error}</p>}
            <div ref={messageEndRef} />
          </div>

          <div className="border-t border-[#e8e7e2] p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={inputValue}
                onChange={(e) => {
                  const next = e.target.value;
                  setInputValue(next);
                  if (activeRabbitHoleId && activeThreadId) {
                    setDraft(activeRabbitHoleId, activeThreadId, next);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder={
                  needsOnboarding
                    ? "Ask your research question..."
                    : "Ask, add, connect, expand, summarize..."
                }
                rows={1}
                className="max-h-[120px] min-h-[40px] flex-1 resize-none rounded-xl border border-[#dddcd7] bg-[#fafaf9] px-3 py-2 text-sm text-[#1c1917] outline-none transition-colors placeholder:text-[#a8a29e] focus:border-[#c8c7c2] focus:bg-[#f3f2ee]"
              />
              <button
                type="submit"
                disabled={
                  isLoading ||
                  busyOnboarding ||
                  !inputValue.trim() ||
                  !activeThreadId
                }
                className={cn(
                  "h-10 w-10 rounded-xl grid place-items-center transition-colors",
                  inputValue.trim() && !isLoading && !busyOnboarding && activeThreadId
                    ? "bg-[#1f1d19] text-white hover:bg-[#11100e]"
                    : "bg-[#ecebe6] text-[#a8a29e]"
                )}
              >
                {isLoading || busyOnboarding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
