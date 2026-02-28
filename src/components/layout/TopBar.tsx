"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Download,
  PanelLeft,
  Plus,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { useGraphStore } from "@/store/graph-store";
import { useUIStore } from "@/store/ui-store";
import { useRabbitHoleStore } from "@/store/rabbit-hole-store";
import type { CurrentView } from "@/store/ui-store";
import { graphStoreToSnapshot } from "@/lib/graph/snapshot";
import { cn } from "@/lib/utils";
import { layout } from "@/lib/design-tokens";
import { UserMenu } from "@/components/auth/UserMenu";

const VIEW_OPTIONS: { value: CurrentView; label: string }[] = [
  { value: "graph", label: "Graph" },
  { value: "list", label: "List" },
];

const AUTO_SAVE_DEBOUNCE_MS = 3000;

/** Save the current graph snapshot to R2 via the /api/graph route. */
async function saveGraphToR2(rabbitHoleId: string): Promise<void> {
  const snapshot = graphStoreToSnapshot();
  const res = await fetch("/api/graph", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rabbitHoleId, graph: snapshot }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
}

export function TopBar() {
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const clusters = useGraphStore((s) => s.clusters);
  const weights = useGraphStore((s) => s.weights);
  const rightPanel = useUIStore((s) => s.rightPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const toggleSearch = useUIStore((s) => s.toggleSearch);
  const togglePaperList = useUIStore((s) => s.togglePaperList);
  const paperListOpen = useUIStore((s) => s.paperListOpen);
  const openAddSource = useUIStore((s) => s.openAddSource);
  const currentView = useUIStore((s) => s.currentView);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const currentRabbitHoleId = useRabbitHoleStore((s) => s.currentRabbitHoleId);

  const nodeCount = nodes.size;
  const hasGraph = nodeCount > 0 || edges.length > 0;

  const handleSave = useCallback(async () => {
    if (!hasGraph || saving || !currentRabbitHoleId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveGraphToR2(currentRabbitHoleId);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(msg);
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [hasGraph, saving, currentRabbitHoleId]);

  // Debounced auto-save whenever graph content changes
  useEffect(() => {
    if (!currentRabbitHoleId || !hasGraph) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      void saveGraphToR2(currentRabbitHoleId).catch((err) => {
        console.warn("[R2] Auto-save failed:", err instanceof Error ? err.message : err);
      });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, clusters, weights, currentRabbitHoleId]);

  const handleTogglePanel = useCallback(
    (panel: typeof rightPanel) => {
      toggleRightPanel(panel);
    },
    [toggleRightPanel]
  );

  return (
    <header
      className={cn(
        "flex items-center justify-between shrink-0 px-3",
        "shadow-[0_1px_0_0_#e8e7e2] bg-white"
      )}
      style={{ height: layout.topBar.height }}
    >
      {/* Left: Logo + sidebar toggle */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={togglePaperList}
            >
              <PanelLeft
                className={cn(
                  "w-4 h-4 transition-colors",
                  paperListOpen ? "text-[#44403c]" : "text-[#78716c]"
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle paper list</TooltipContent>
        </Tooltip>

        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src="/rodeo.png"
            alt=""
            className="h-8 w-8 object-contain flex-shrink-0 rounded-sm"
            width={32}
            height={32}
          />
          <span className="text-sm font-semibold text-[#1c1917] truncate hidden lg:inline">
            Research Rodeo
          </span>
        </div>
      </div>

      {/* Center: View toggle + node count */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg bg-[#f3f2ee] p-0.5 border border-[#e8e7e2]">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCurrentView(opt.value)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                currentView === opt.value
                  ? "bg-white text-[#1c1917] shadow-sm"
                  : "text-[#78716c] hover:text-[#44403c]"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {nodeCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {nodeCount}
          </Badge>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Add Sources */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openAddSource()}
              className="gap-1.5 text-xs text-[#57534e]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Sources</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add source from URL (PDF, video, link) -- Cmd+V</TooltipContent>
        </Tooltip>

        {/* Search */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleSearch}
              className="gap-1.5 text-xs text-[#57534e]"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:inline-flex items-center rounded bg-[#f3f2ee] px-1 py-0.5 text-[9px] font-mono text-[#78716c]">
                {"\u2318"}K
              </kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Search in graph (Cmd+K)</TooltipContent>
        </Tooltip>

        {/* Save to R2 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleSave}
              disabled={!hasGraph || !currentRabbitHoleId || saving}
            >
              <Save
                className={cn(
                  "w-3.5 h-3.5 transition-colors",
                  saveError
                    ? "text-red-500"
                    : savedAt
                      ? "text-emerald-600"
                      : "text-[#57534e]"
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {saveError
              ? `Save failed: ${saveError}`
              : savedAt
                ? "Saved to cloud"
                : !hasGraph
                  ? "Add nodes to save"
                  : saving
                    ? "Saving…"
                    : "Save graph to cloud (auto-saves every 3s)"}
          </TooltipContent>
        </Tooltip>

        {/* Export */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={rightPanel === "export" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => handleTogglePanel("export")}
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Export (Cmd+E)</TooltipContent>
        </Tooltip>

        {/* User Menu */}
        <div className="ml-1 pl-1 border-l border-[#e8e7e2]">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
