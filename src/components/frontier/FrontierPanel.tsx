"use client";

import { useMemo, useCallback } from "react";
import { Plus, X, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useGraphStore } from "@/store/graph-store";
import { executeGraphCommand } from "@/lib/graph/commands";
import { formatScore } from "@/lib/utils";
import { extractDomain } from "@/lib/utils/arxiv-urls";

export function FrontierPanel() {
  const getFrontierNodes = useGraphStore((s) => s.getFrontierNodes);
  const selectNode = useGraphStore((s) => s.selectNode);

  const materializeNode = useCallback(async (nodeId: string) => {
    const node = useGraphStore.getState().nodes.get(nodeId);
    if (!node) return;
    await executeGraphCommand({
      type: "add-node",
      paper: node.data,
      materialize: true,
      source: "canvas",
    });
  }, []);

  const archiveNode = useCallback(async (nodeId: string) => {
    await executeGraphCommand({
      type: "archive-node",
      nodeId,
      source: "canvas",
    });
  }, []);

  const frontierNodes = getFrontierNodes();

  // Group by expansion source (clusterId as proxy)
  const grouped = useMemo(() => {
    const groups = new Map<string, typeof frontierNodes>();
    for (const node of frontierNodes) {
      const key = node.clusterId ?? "ungrouped";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(node);
    }
    return groups;
  }, [frontierNodes]);

  if (frontierNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
        <Eye className="w-8 h-8 text-[#a8a29e] mb-3" />
        <p className="text-sm text-[#57534e] mb-1">No frontier papers</p>
        <p className="text-xs text-[#a8a29e]">
          Expand a paper node to discover related work
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e7e2]">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[#1c1917]">Frontier</h2>
          <span className="bg-[#f3f2ee] text-[#44403c] rounded-full px-3 py-1 text-[10px]">
            {frontierNodes.length}
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {Array.from(grouped.entries()).map(([groupKey, groupNodes]) => (
            <div key={groupKey}>
              {grouped.size > 1 && groupKey !== "ungrouped" && (
                <div className="px-3 py-1.5 text-[10px] text-[#a8a29e] uppercase tracking-wider">
                  Cluster {groupKey.slice(0, 8)}
                </div>
              )}

              {groupNodes.map((node) => (
                <div
                  key={node.id}
                  className="group flex items-start gap-3 p-3 rounded-lg hover:bg-[#f3f2ee] transition-colors cursor-pointer"
                  onClick={() => selectNode(node.id)}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-paper-title text-xs text-[#1c1917] leading-tight line-clamp-2 mb-1">
                      {node.data.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {node.data.year && (
                        <span className="text-[10px] text-[#78716c]">
                          {node.data.year}
                        </span>
                      )}
                      {node.data.url && (
                        <span className="text-[10px] text-[#a8a29e]">
                          {extractDomain(node.data.url)}
                        </span>
                      )}
                      {node.scores.relevance > 0 && (
                        <span className="text-[10px] text-[#7c3aed]">
                          {formatScore(node.scores.relevance)} relevant
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Materialize"
                      onClick={(e) => {
                        e.stopPropagation();
                        void materializeNode(node.id);
                      }}
                    >
                      <Plus className="w-3.5 h-3.5 text-green-400" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Dismiss"
                      onClick={(e) => {
                        e.stopPropagation();
                        void archiveNode(node.id);
                      }}
                    >
                      <X className="w-3.5 h-3.5 text-[#78716c]" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </motion.div>
  );
}
