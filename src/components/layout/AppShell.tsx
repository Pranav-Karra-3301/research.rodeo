"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { GraphCanvas } from "@/components/graph/GraphCanvas";
import { UnifiedChatInput } from "@/components/chat/UnifiedChatInput";
import { ChatView } from "@/components/chat/ChatView";
import { ListView } from "@/components/list/ListView";
import { SearchBar } from "@/components/search/SearchBar";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { PaperListSidebar } from "@/components/layout/PaperListSidebar";
import { AddSourceDialog } from "@/components/source/AddSourceDialog";
import { useUIStore } from "@/store/ui-store";
import { layout, animation } from "@/lib/design-tokens";
import { isValidSourceUrl } from "@/lib/utils/url-source";

// Heavy right-panel components: load only when panel is open (bundle-dynamic-imports)
const ReaderPanel = dynamic(
  () => import("@/components/reader/ReaderPanel").then((m) => ({ default: m.ReaderPanel })),
  { ssr: false, loading: () => <RightPanelSkeleton /> }
);
const FrontierPanel = dynamic(
  () => import("@/components/frontier/FrontierPanel").then((m) => ({ default: m.FrontierPanel })),
  { ssr: false, loading: () => <RightPanelSkeleton /> }
);
const ExportPanel = dynamic(
  () => import("@/components/export/ExportPanel").then((m) => ({ default: m.ExportPanel })),
  { ssr: false, loading: () => <RightPanelSkeleton /> }
);
const TimelinePanel = dynamic(
  () => import("@/components/timeline/TimelinePanel").then((m) => ({ default: m.TimelinePanel })),
  { ssr: false, loading: () => <RightPanelSkeleton /> }
);

function RightPanelSkeleton() {
  return (
    <div className="flex items-center justify-center h-full text-sm text-[#78716c]">
      Loading…
    </div>
  );
}

export function AppShell() {
  const rightPanel = useUIStore((s) => s.rightPanel);
  const paperListOpen = useUIStore((s) => s.paperListOpen);
  const currentView = useUIStore((s) => s.currentView);
  const openAddSource = useUIStore((s) => s.openAddSource);

  // Cmd+V: open Add source dialog; if clipboard is a URL, pre-fill it
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey && e.key === "v")) return;
      const el = document.activeElement;
      const isInput =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (isInput) return;
      e.preventDefault();
      navigator.clipboard.readText().then((text) => {
        openAddSource(isValidSourceUrl(text) ? text : undefined);
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openAddSource]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-col h-screen w-screen bg-[#f8f7f4] text-[#1c1917] overflow-hidden">
        {/* Top Bar */}
        <TopBar />

        {/* Main 3-panel layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Paper List Sidebar */}
          <AnimatePresence initial={false}>
            {paperListOpen && currentView !== "chat" && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{
                  width: layout.sidebar.width,
                  opacity: 1,
                }}
                exit={{ width: 0, opacity: 0 }}
                transition={animation.normal}
                className="shrink-0 overflow-hidden"
              >
                <PaperListSidebar />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Center: View-dependent content */}
          <div className="flex-1 relative min-w-0">
            {currentView === "graph" && (
              <>
                <GraphCanvas />
                <UnifiedChatInput />
              </>
            )}
            {currentView === "list" && <ListView />}
            {currentView === "chat" && <ChatView />}
          </div>

          {/* Right: Reader / Export / Frontier / Timeline */}
          <AnimatePresence initial={false}>
            {rightPanel && currentView !== "chat" && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{
                  width: layout.rightPanel.width,
                  opacity: 1,
                }}
                exit={{ width: 0, opacity: 0 }}
                transition={animation.normal}
                className="shadow-[-4px_0_12px_rgba(0,0,0,0.04)] bg-white overflow-hidden shrink-0"
              >
                <div
                  className="h-full"
                  style={{ width: layout.rightPanel.width }}
                >
                  {rightPanel === "reader" && <ReaderPanel />}
                  {rightPanel === "frontier" && <FrontierPanel />}
                  {rightPanel === "export" && <ExportPanel />}
                  {rightPanel === "timeline" && <TimelinePanel />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Status Bar */}
        <StatusBar />

        {/* Search Dialog (overlay) */}
        <SearchBar />
        {/* Add source from URL (Cmd+V or top bar / context menu) */}
        <AddSourceDialog />
      </div>
    </TooltipProvider>
  );
}
