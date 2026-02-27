"use client";

import { useState, useMemo, useCallback } from "react";
import { Download, Copy, Check, FileText, BookOpen, Braces, FileDown, Vault } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useGraphStore } from "@/store/graph-store";
import { generateBibTeX, generateRIS, generateMarkdownReview, generateObsidianExport, downloadFile } from "@/lib/utils/export";
import type { PaperMetadata, ExportFormat, Cluster } from "@/types";

type Scope = "all" | "cluster" | "selected";

const FMT_EXT: Record<ExportFormat, string> = { bibtex: "bib", ris: "ris", markdown: "md", json: "json", obsidian: "md" };
const FMT_MIME: Record<ExportFormat, string> = { bibtex: "application/x-bibtex", ris: "application/x-research-info-systems", markdown: "text/markdown", json: "application/json", obsidian: "text/markdown" };

export function ExportPanel({ className }: { className?: string }) {
  const [format, setFormat] = useState<ExportFormat>("bibtex");
  const [scope, setScope] = useState<Scope>("all");
  const [copied, setCopied] = useState(false);
  const [isGeneratingReview, setIsGeneratingReview] = useState(false);
  const [reviewContent, setReviewContent] = useState<string | null>(null);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const clusters = useGraphStore((s) => s.clusters);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  const allPapers: PaperMetadata[] = useMemo(() => {
    const nodeArray =
      nodes instanceof Map ? Array.from(nodes.values()) : (nodes ?? []);
    return nodeArray.filter((n) => n.state !== "archived").map((n) => n.data);
  }, [nodes]);

  const scopedPapers: PaperMetadata[] = useMemo(() => {
    if (scope === "all") return allPapers;

    const nodeArray =
      nodes instanceof Map ? Array.from(nodes.values()) : (nodes ?? []);
    const clusterArray: Cluster[] = clusters ?? [];

    if (scope === "selected" && selectedNodeId) {
      const node = nodeArray.find((n) => n.id === selectedNodeId);
      return node ? [node.data] : [];
    }

    if (scope === "cluster" && selectedNodeId) {
      const selectedNode = nodeArray.find((n) => n.id === selectedNodeId);
      if (selectedNode?.clusterId) {
        const cluster = clusterArray.find(
          (c) => c.id === selectedNode.clusterId
        );
        if (cluster) {
          return cluster.nodeIds
            .map((id) => nodeArray.find((n) => n.id === id)?.data)
            .filter((p): p is PaperMetadata => p !== undefined);
        }
      }
    }

    return allPapers;
  }, [scope, allPapers, nodes, clusters, selectedNodeId]);

  const preview = useMemo(() => {
    if (format === "markdown" && reviewContent) return reviewContent;

    switch (format) {
      case "bibtex":
        return generateBibTeX(scopedPapers.slice(0, 5));
      case "ris":
        return generateRIS(scopedPapers.slice(0, 5));
      case "json":
        return JSON.stringify(scopedPapers.slice(0, 3), null, 2);
      case "markdown":
        return generateMarkdownReview(
          scopedPapers.slice(0, 5),
          (clusters ?? []) as Cluster[]
        );
      case "obsidian":
        return generateObsidianExport(
          nodes instanceof Map ? nodes : new Map(),
          edges ?? [],
          (clusters ?? []) as Cluster[]
        ).slice(0, 2000) + "\n\n... (preview truncated)";
      default:
        return "";
    }
  }, [format, scopedPapers, clusters, reviewContent, nodes, edges]);

  const fullContent = useMemo(() => {
    if (format === "markdown" && reviewContent) return reviewContent;

    switch (format) {
      case "bibtex":
        return generateBibTeX(scopedPapers);
      case "ris":
        return generateRIS(scopedPapers);
      case "json":
        return JSON.stringify(scopedPapers, null, 2);
      case "markdown":
        return generateMarkdownReview(
          scopedPapers,
          (clusters ?? []) as Cluster[]
        );
      case "obsidian":
        return generateObsidianExport(
          nodes instanceof Map ? nodes : new Map(),
          edges ?? [],
          (clusters ?? []) as Cluster[]
        );
      default:
        return "";
    }
  }, [format, scopedPapers, clusters, reviewContent, nodes, edges]);

  const handleDownload = useCallback(() => {
    const ext = FMT_EXT[format];
    const mime = FMT_MIME[format];
    const filename = format === "obsidian"
      ? `research-rodeo-obsidian-vault.${ext}`
      : `research-rodeo-export.${ext}`;
    downloadFile(fullContent, filename, mime);
  }, [fullContent, format]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(fullContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [fullContent]);

  const handleDraftReview = useCallback(async () => {
    setIsGeneratingReview(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "markdown",
          papers: scopedPapers,
          clusters: clusters ?? [],
          includeReview: true,
        }),
      });
      const data = await res.json();
      if (data.status === "success" && data.data?.content) {
        setReviewContent(data.data.content);
        setFormat("markdown");
      }
    } catch {
      // Fall back to local generation
    } finally {
      setIsGeneratingReview(false);
    }
  }, [scopedPapers, clusters]);

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[#f8f7f4] border-l border-[#e8e7e2]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e7e2]">
        <span className="text-sm font-medium text-[#1c1917]">Export</span>
        <span className="text-xs text-[#78716c]">
          {scopedPapers.length} paper{scopedPapers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Scope selector */}
      <div className="px-4 pt-3 flex gap-2">
        {(["all", "cluster", "selected"] as Scope[]).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              scope === s
                ? "bg-violet-600 text-white"
                : "bg-[#f3f2ee] text-[#44403c] hover:bg-[#eeeee8]"
            )}
          >
            {s === "all" ? "All Papers" : s === "cluster" ? "Cluster" : "Selected"}
          </button>
        ))}
      </div>

      {/* Format tabs */}
      <div className="px-4 pt-3">
        <Tabs
          value={format}
          onValueChange={(v) => {
            setFormat(v as ExportFormat);
            setReviewContent(null);
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="bibtex" className="flex-1 gap-1 text-xs">
              <FileText className="h-3.5 w-3.5" /> BibTeX
            </TabsTrigger>
            <TabsTrigger value="ris" className="flex-1 gap-1 text-xs">
              <FileDown className="h-3.5 w-3.5" /> RIS
            </TabsTrigger>
            <TabsTrigger value="obsidian" className="flex-1 gap-1 text-xs">
              <Vault className="h-3.5 w-3.5" /> Obsidian
            </TabsTrigger>
            <TabsTrigger value="markdown" className="flex-1 gap-1 text-xs">
              <BookOpen className="h-3.5 w-3.5" /> Review
            </TabsTrigger>
            <TabsTrigger value="json" className="flex-1 gap-1 text-xs">
              <Braces className="h-3.5 w-3.5" /> JSON
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Draft AI Review button */}
      {format === "markdown" && (
        <div className="px-4 pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDraftReview}
            disabled={isGeneratingReview || scopedPapers.length === 0}
            className="w-full gap-1.5"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {isGeneratingReview
              ? "Generating AI Review..."
              : "Draft Literature Review with AI"}
          </Button>
        </div>
      )}

      {/* Preview */}
      <ScrollArea className="flex-1 px-4 py-3">
        <div className="h-full rounded-lg bg-white border border-[#e8e7e2] overflow-hidden">
          <pre
            className={cn(
              "p-3 text-xs whitespace-pre-wrap break-words",
              format === "markdown" || format === "obsidian"
                ? "font-paper-title text-[#44403c]"
                : "font-mono text-[#57534e]"
            )}
          >
            {scopedPapers.length === 0
              ? "No papers to export. Add papers to your graph first."
              : preview}
            {scopedPapers.length > 5 &&
              !reviewContent &&
              `\n\n... and ${scopedPapers.length - 5} more`}
          </pre>
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="flex gap-2 px-4 py-3 border-t border-[#e8e7e2]">
        <Button
          variant="default"
          size="sm"
          onClick={handleDownload}
          disabled={scopedPapers.length === 0}
          className="flex-1 gap-1.5"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={scopedPapers.length === 0}
          className="flex-1 gap-1.5"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
