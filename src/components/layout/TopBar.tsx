"use client";

import { useCallback } from "react";
import {
  Search,
  Sliders,
  MessageSquare,
  Download,
  PanelLeft,
  Link2,
  Clock,
} from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { WeightControls } from "@/components/weights/WeightControls";
import { useGraphStore } from "@/store/graph-store";
import { useUIStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";
import { layout } from "@/lib/design-tokens";

export function TopBar() {
  const nodes = useGraphStore((s) => s.nodes);
  const rightPanel = useUIStore((s) => s.rightPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const chatDockOpen = useUIStore((s) => s.chatDockOpen);
  const toggleChatDock = useUIStore((s) => s.toggleChatDock);
  const toggleSearch = useUIStore((s) => s.toggleSearch);
  const togglePaperList = useUIStore((s) => s.togglePaperList);
  const paperListOpen = useUIStore((s) => s.paperListOpen);
  const weightsPanelOpen = useUIStore((s) => s.weightsPanelOpen);
  const toggleWeights = useUIStore((s) => s.toggleWeights);
  const openAddSource = useUIStore((s) => s.openAddSource);
  const currentView = useUIStore((s) => s.currentView);
  const setCurrentView = useUIStore((s) => s.setCurrentView);

  const nodeCount = nodes.size;

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
          <span className="text-sm font-semibold text-[#1c1917] truncate">
            Research Rodeo
          </span>
        </div>
      </div>

      {/* Center: View toggle + node count */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg bg-[#f3f2ee] p-0.5 border border-[#e8e7e2]">
          <button
            onClick={() => setCurrentView("graph")}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              currentView === "graph"
                ? "bg-white text-[#1c1917] shadow-sm"
                : "text-[#78716c] hover:text-[#44403c]"
            )}
          >
            Graph
          </button>
          <button
            onClick={() => setCurrentView("list")}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              currentView === "list"
                ? "bg-white text-[#1c1917] shadow-sm"
                : "text-[#78716c] hover:text-[#44403c]"
            )}
          >
            List
          </button>
        </div>

        {nodeCount > 0 && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {nodeCount}
          </Badge>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        {/* Add source (URL) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => openAddSource()}
            >
              <Link2 className="w-3.5 h-3.5 text-[#57534e]" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add source from URL (PDF, video, link) — Cmd+V</TooltipContent>
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
          <TooltipContent>Search papers (Cmd+K)</TooltipContent>
        </Tooltip>

        {/* Weights */}
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={weightsPanelOpen ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={toggleWeights}
              >
                <Sliders className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scoring weights</TooltipContent>
          </Tooltip>

          <AnimatePresence>
            {weightsPanelOpen && (
              <div className="absolute right-0 top-full mt-2 z-50">
                <WeightControls />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Chat */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={chatDockOpen ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={toggleChatDock}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle chat dock (Cmd+/)</TooltipContent>
        </Tooltip>

        {/* Timeline */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={rightPanel === "timeline" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8"
              onClick={() => handleTogglePanel("timeline")}
            >
              <Clock className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Exploration timeline</TooltipContent>
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
      </div>
    </header>
  );
}
