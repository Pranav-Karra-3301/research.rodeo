"use client";

import {
  Search,
  Plus,
  Expand,
  Archive,
  StickyNote,
  Network,
  Navigation,
  Trash2,
  Clock,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Button } from "@/components/ui/Button";
import { useTimelineStore, type TimelineEvent } from "@/store/timeline-store";
import { useGraphStore } from "@/store/graph-store";
import { cn } from "@/lib/utils";

const EVENT_ICONS: Record<TimelineEvent["type"], React.ElementType> = {
  search: Search,
  "add-node": Plus,
  expand: Expand,
  archive: Archive,
  note: StickyNote,
  cluster: Network,
  navigate: Navigation,
};

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TimelinePanel({ className }: { className?: string }) {
  const events = useTimelineStore((s) => s.events);
  const clearEvents = useTimelineStore((s) => s.clearEvents);
  const selectNode = useGraphStore((s) => s.selectNode);

  const handleEventClick = (event: TimelineEvent) => {
    if (event.nodeId) {
      selectNode(event.nodeId);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-[#f8f7f4] border-l border-[#e8e7e2]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e7e2]">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-sm font-medium text-[#1c1917]">Timeline</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#78716c]">
            {events.length} event{events.length !== 1 ? "s" : ""}
          </span>
          {events.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={clearEvents}
              title="Clear timeline"
            >
              <Trash2 className="w-3 h-3 text-[#a8a29e]" />
            </Button>
          )}
        </div>
      </div>

      {/* Events */}
      <ScrollArea className="flex-1">
        {events.length === 0 ? (
          <div className="text-center py-12 px-4">
            <Clock className="w-8 h-8 text-[#dddcd7] mx-auto mb-3" />
            <p className="text-sm text-[#78716c]">No events yet</p>
            <p className="text-xs text-[#a8a29e] mt-1">
              Your exploration history will appear here
            </p>
          </div>
        ) : (
          <div className="py-2">
            {events.map((event) => {
              const Icon = EVENT_ICONS[event.type] ?? Clock;
              return (
                <button
                  key={event.id}
                  onClick={() => handleEventClick(event)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors",
                    event.nodeId
                      ? "hover:bg-[#f3f2ee] cursor-pointer"
                      : "cursor-default"
                  )}
                >
                  <div className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-[#f3f2ee] flex items-center justify-center">
                    <Icon className="w-3 h-3 text-[#78716c]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[#44403c] leading-snug line-clamp-2">
                      {event.summary}
                    </p>
                    <p className="text-[10px] text-[#a8a29e] mt-0.5">
                      {relativeTime(event.timestamp)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
