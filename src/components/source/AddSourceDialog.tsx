"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Link2, Loader2, Globe, FileText, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useGraphStore } from "@/store/graph-store";
import { useUIStore } from "@/store/ui-store";
import { useRabbitHoleStore, newRabbitHoleId } from "@/store/rabbit-hole-store";
import { executeGraphCommand } from "@/lib/graph/commands";
import { toDbNodeId } from "@/lib/db/node-id";
import {
  createNodeFromUrl,
  isValidSourceUrl,
  scrapeUrl,
  getSourceType,
  type ScrapeResult,
} from "@/lib/utils/url-source";
import { cn } from "@/lib/utils";
import type { PaperMetadata } from "@/types";

export function AddSourceDialog() {
  const addSourceOpen = useUIStore((s) => s.addSourceOpen);
  const addSourceInitialUrl = useUIStore((s) => s.addSourceInitialUrl);
  const closeAddSource = useUIStore((s) => s.closeAddSource);

  const dbConnection = useRabbitHoleStore((s) => s.dbConnection);
  const currentRabbitHoleId = useRabbitHoleStore((s) => s.currentRabbitHoleId);
  const setCurrentRabbitHoleId = useRabbitHoleStore((s) => s.setCurrentRabbitHoleId);

  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ScrapeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scrapeError, setScrapeError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (addSourceOpen) {
      setUrl(addSourceInitialUrl ?? "");
      setPreview(null);
      setScrapeError(false);
      requestAnimationFrame(() => inputRef.current?.focus());
      if (addSourceInitialUrl && isValidSourceUrl(addSourceInitialUrl)) {
        fetchPreview(addSourceInitialUrl);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addSourceOpen, addSourceInitialUrl]);

  const fetchPreview = useCallback(async (rawUrl: string) => {
    setLoading(true);
    setScrapeError(false);
    setPreview(null);
    const result = await scrapeUrl(rawUrl);
    setLoading(false);
    if (result) {
      setPreview(result);
    } else {
      setScrapeError(true);
    }
  }, []);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setPreview(null);
    setScrapeError(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (isValidSourceUrl(value.trim())) {
      debounceRef.current = setTimeout(() => fetchPreview(value.trim()), 600);
    }
  };

  /** Ensure there is a current rabbit hole; creates one if needed. Returns its id. */
  async function ensureRabbitHole(): Promise<string | null> {
    if (currentRabbitHoleId) return currentRabbitHoleId;
    if (!dbConnection) return null;
    const id = newRabbitHoleId();
    const name = "My First Rabbit Hole";
    // Call reducer — subscription callback will upsert the hole in the store
    dbConnection.reducers.createRabbitHole({ id, name, rootQuery: undefined });
    setCurrentRabbitHoleId(id);
    return id;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!isValidSourceUrl(trimmed)) return;

    setSubmitting(true);
    try {
      const rabbitHoleId = await ensureRabbitHole();

      if (!rabbitHoleId || !dbConnection) {
        const fallbackNode = createNodeFromUrl(trimmed, preview ?? undefined);
        await executeGraphCommand({
          type: "add-node",
          paper: fallbackNode.data,
          materialize: true,
          source: "canvas",
        });
        closeAddSource();
        setUrl(""); setPreview(null);
        return;
      }

      // Call the API route to scrape + prefetch content
      const res = await fetch("/api/sources/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, rabbit_hole_id: rabbitHoleId }),
      });

      if (!res.ok) throw new Error("API error");

      const data = (await res.json()) as {
        nodeId: string;
        dataJson: string;
        content?: string | null;
        contentTruncated?: boolean;
      };
      const parsed = JSON.parse(data.dataJson) as PaperMetadata;
      const addResult = await executeGraphCommand({
        type: "add-node",
        paper: parsed,
        materialize: true,
        source: "canvas",
      });
      if (!addResult.applied) {
        throw new Error(addResult.error ?? "Failed to add source");
      }
      const graphNodeId = addResult.addedNodeIds?.[0] ?? data.nodeId;

      // If content was fetched, persist it too
      if (data.content) {
        dbConnection.reducers.setNodeContent({
          rabbitHoleId,
          nodeId: toDbNodeId(rabbitHoleId, graphNodeId),
          url: trimmed,
          content: data.content,
          truncated: data.contentTruncated ?? false,
        });
        const nodes = new Map(useGraphStore.getState().nodes);
        const node = nodes.get(graphNodeId);
        if (node) {
          nodes.set(graphNodeId, {
            ...node,
            data: {
              ...node.data,
              fetchedContent: data.content,
              contentTruncated: data.contentTruncated ?? false,
            },
          });
          useGraphStore.setState({ nodes });
        }
      }

    } catch (err) {
      console.error("[AddSourceDialog] Error:", err);
      const fallbackNode = createNodeFromUrl(trimmed, preview ?? undefined);
      await executeGraphCommand({
        type: "add-node",
        paper: fallbackNode.data,
        materialize: true,
        source: "canvas",
      });
    } finally {
      setSubmitting(false);
      closeAddSource();
      setUrl(""); setPreview(null);
    }
  };

  const valid = isValidSourceUrl(url.trim());
  const busy = loading || submitting;

  return (
    <Dialog open={addSourceOpen} onOpenChange={(open) => !open && closeAddSource()}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-[#e8e7e2]">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium">
            <Link2 className="w-3.5 h-3.5 text-violet-500" />
            Add source
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col">
          {/* URL input */}
          <div className="px-4 py-3">
            <Input
              ref={inputRef}
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              className="font-mono text-xs h-8"
            />
          </div>

          {/* Preview */}
          {(loading || preview || scrapeError) && (
            <div className="mx-4 mb-3 rounded-lg border border-[#e8e7e2] overflow-hidden bg-[#f8f7f4]">
              {loading && (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-[#78716c]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                  Fetching preview…
                </div>
              )}
              {scrapeError && !loading && (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-[#78716c]">
                  <AlertCircle className="w-3.5 h-3.5 text-[#a8a29e]" />
                  Could not fetch preview — will add URL as-is.
                </div>
              )}
              {preview && !loading && (
                <div className="flex gap-3 p-3">
                  <div
                    className={cn(
                      "shrink-0 rounded-md overflow-hidden border border-[#e8e7e2]",
                      preview.ogImage ? "w-20 h-14" : "w-10 h-10 flex items-center justify-center bg-white"
                    )}
                  >
                    {preview.ogImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview.ogImage} alt="" className="w-full h-full object-cover" />
                    ) : preview.isPdf ? (
                      <FileText className="w-5 h-5 text-violet-500/70" />
                    ) : (
                      <Globe className="w-4 h-4 text-[#a8a29e]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#1c1917] leading-snug line-clamp-2 mb-0.5">
                      {preview.title}
                    </p>
                    {preview.description && (
                      <p className="text-[10px] text-[#78716c] line-clamp-2 leading-relaxed">
                        {preview.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      {preview.faviconUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={preview.faviconUrl}
                          alt=""
                          className="w-3 h-3 rounded-sm"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <span className="text-[10px] text-[#a8a29e]">
                        {preview.siteName ?? (() => {
                          try { return new URL(preview.url).hostname.replace(/^www\./, ""); } catch { return ""; }
                        })()}
                      </span>
                      {preview.isPdf && (
                        <span className="ml-1 bg-violet-500/10 text-violet-600 text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                          PDF
                        </span>
                      )}
                      {getSourceType(preview.url) === "wikipedia" && (
                        <span className="ml-1 bg-blue-500/10 text-blue-600 text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                          Wikipedia
                        </span>
                      )}
                      {getSourceType(preview.url) === "youtube" && (
                        <span className="ml-1 bg-red-500/10 text-red-600 text-[9px] px-1.5 py-0.5 rounded-full font-medium">
                          YouTube
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 px-4 pb-4">
            <Button type="button" variant="ghost" size="sm" onClick={closeAddSource} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!valid || busy}>
              {submitting ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                  Adding…
                </>
              ) : loading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                  Fetching…
                </>
              ) : "Add to graph"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
