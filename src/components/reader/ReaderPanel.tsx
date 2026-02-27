"use client";

import { X } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { useGraphStore } from "@/store/graph-store";
import { useUIStore } from "@/store/ui-store";
import { ReaderDetailsTab } from "./ReaderDetailsTab";
import { ReaderNotesTab } from "./ReaderNotesTab";
import { ReaderAskAiTab } from "./ReaderAskAiTab";
import { ReaderViewTab } from "./ReaderViewTab";

export function ReaderPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const setRightPanel = useUIStore((s) => s.setRightPanel);
  const node = selectedNodeId ? nodes.get(selectedNodeId) : undefined;

  const hasViewUrl = !!(node?.data.url || node?.data.openAccessPdf);

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
