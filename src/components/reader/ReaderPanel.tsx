"use client";

import { X, Star, XCircle, Lightbulb, Link2, Plus } from "lucide-react";
import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { useGraphStore } from "@/store/graph-store";
import { useUIStore } from "@/store/ui-store";
import { useAnnotations } from "@/hooks/useAnnotations";
import { ReaderDetailsTab } from "./ReaderDetailsTab";
import { ReaderNotesTab } from "./ReaderNotesTab";
import { ReaderAskAiTab } from "./ReaderAskAiTab";
import { ReaderViewTab } from "./ReaderViewTab";

export function ReaderPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const materializeNode = useGraphStore((s) => s.materializeNode);
  const setRightPanel = useUIStore((s) => s.setRightPanel);
  const node = selectedNodeId ? nodes.get(selectedNodeId) : undefined;
  const { addKeyFind, addDeadEnd, addInsight } = useAnnotations();

  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const isFrontier = node?.state === "discovered";
  const hasViewUrl = !!(node?.data.url || node?.data.openAccessPdf);

  const handleAddLink = useCallback(async () => {
    if (!linkUrl.trim()) return;
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: linkUrl.trim(), limit: 1 }),
      });
      if (res.ok) {
        // Link added
      }
    } catch {
      // Silently fail
    }
    setLinkUrl("");
    setShowLinkInput(false);
  }, [linkUrl]);

  if (!node) {
    return (
      <div className="flex items-center justify-center h-full text-[#78716c] text-sm">
        Select a paper to view details
      </div>
    );
  }

  const { data: paper } = node;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-[#e8e7e2]">
        <h2 className="font-paper-title text-lg text-[#1c1917] leading-snug pr-2">
          {paper.title}
        </h2>
        <button
          onClick={() => setRightPanel(null)}
          className="text-[#78716c] hover:text-[#44403c] p-1 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Frontier banner with materialize button */}
      {isFrontier && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#7c3aed]/5 border-b border-[#7c3aed]/15">
          <span className="text-[10px] uppercase tracking-wider font-medium text-[#7c3aed]/70 bg-[#7c3aed]/10 rounded px-1.5 py-0.5">
            Frontier
          </span>
          <span className="text-xs text-[#78716c] flex-1">
            Preview — not yet in your graph
          </span>
          <Button
            size="sm"
            className="gap-1.5 bg-[#7c3aed] hover:bg-[#6d28d9] text-white h-7 text-xs"
            onClick={() => materializeNode(node.id)}
          >
            <Plus className="w-3.5 h-3.5" />
            Materialize
          </Button>
        </div>
      )}

      {/* Action toolbar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-[#e8e7e2]">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => addKeyFind(node.id)}
            >
              <Star className="w-3.5 h-3.5 text-[#eab308]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mark as key finding</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => addDeadEnd(node.id)}
            >
              <XCircle className="w-3.5 h-3.5 text-[#ef4444]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mark as dead end</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => addInsight(node.id)}
            >
              <Lightbulb className="w-3.5 h-3.5 text-[#f59e0b]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add insight</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showLinkInput ? "default" : "ghost"}
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowLinkInput(!showLinkInput)}
            >
              <Link2 className="w-3.5 h-3.5 text-[#3b82f6]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add related link</TooltipContent>
        </Tooltip>

        {showLinkInput && (
          <form
            onSubmit={(e) => { e.preventDefault(); handleAddLink(); }}
            className="flex items-center gap-1 ml-1 flex-1"
          >
            <Input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Paste URL..."
              className="h-7 text-xs flex-1"
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2"
              disabled={!linkUrl.trim()}
            >
              Add
            </Button>
          </form>
        )}
      </div>

      <Tabs
        key={node.id}
        defaultValue={hasViewUrl ? "view" : "details"}
        className="flex flex-col flex-1 min-h-0"
      >
        <div className="px-4 py-3 border-b border-[#e8e7e2]">
          <TabsList className="w-full">
            {hasViewUrl && (
              <TabsTrigger value="view" className="flex-1 text-xs">
                View
              </TabsTrigger>
            )}
            <TabsTrigger value="details" className="flex-1 text-xs">
              Details
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-1 text-xs">
              Notes
            </TabsTrigger>
            <TabsTrigger value="ask-ai" className="flex-1 text-xs">
              Ask AI
            </TabsTrigger>
          </TabsList>
        </div>

        {hasViewUrl && (
          <TabsContent value="view" className="flex-1 min-h-0 mt-0">
            <ReaderViewTab node={node} />
          </TabsContent>
        )}

        <TabsContent value="details" className="flex-1 min-h-0 mt-0">
          <ReaderDetailsTab node={node} />
        </TabsContent>

        <TabsContent value="notes" className="flex-1 min-h-0 mt-0">
          <ReaderNotesTab key={node.id} node={node} />
        </TabsContent>

        <TabsContent value="ask-ai" className="flex-1 min-h-0 mt-0 flex flex-col">
          <ReaderAskAiTab node={node} />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
