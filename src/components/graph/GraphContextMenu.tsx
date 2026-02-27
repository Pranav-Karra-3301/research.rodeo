"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Compass,
  History,
  Quote,
  Swords,
  Eye,
  Search,
  Copy,
  FileText,
  Archive,
  Maximize,
  Map,
  LayoutGrid,
  Trash2,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExpansionMode } from "@/types";

interface MenuPosition {
  x: number;
  y: number;
}

interface NodeMenuProps {
  type: "node";
  position: MenuPosition;
  nodeId: string;
  nodeTitle: string;
  onExpand: (mode: ExpansionMode) => void;
  onViewDetails: () => void;
  onFindSimilar: () => void;
  onCopyTitle: () => void;
  onOpenPdf: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}

interface CanvasMenuProps {
  type: "canvas";
  position: MenuPosition;
  onFitView: () => void;
  onToggleMinimap: () => void;
  onAutoLayout: () => void;
  onAddSource: () => void;
  onClearGraph: () => void;
  onClose: () => void;
}

type ContextMenuProps = NodeMenuProps | CanvasMenuProps;

interface MenuItem {
  label: string;
  icon: typeof Compass;
  shortcut?: string;
  onClick: () => void;
  danger?: boolean;
}

interface MenuGroup {
  items: MenuItem[];
}

export function GraphContextMenu(props: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        props.onClose();
      }
    },
    [props]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [handleClickOutside]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [props]);

  const groups: MenuGroup[] =
    props.type === "node"
      ? buildNodeMenuGroups(props)
      : buildCanvasMenuGroups(props);

  // Clamp position so the menu doesn't overflow the viewport
  const menuWidth = 220;
  const menuHeight = 320;
  const clampedX = Math.min(props.position.x, window.innerWidth - menuWidth - 8);
  const clampedY = Math.min(props.position.y, window.innerHeight - menuHeight - 8);

  return (
    <div
      ref={menuRef}
      className={cn(
        "fixed z-[100] min-w-[180px] py-1 rounded-lg",
        "bg-white border border-[#e8e7e2] shadow-xl shadow-black/8"
      )}
      style={{ left: Math.max(8, clampedX), top: Math.max(8, clampedY) }}
    >
      {groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && <div className="h-px bg-[#e8e7e2] my-1" />}
          {group.items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                item.onClick();
                props.onClose();
              }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-xs",
                "transition-colors",
                item.danger
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-[#44403c] hover:bg-[#f3f2ee] hover:text-[#1c1917]"
              )}
            >
              <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-[#78716c] ml-2">{item.shortcut}</span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function buildNodeMenuGroups(props: NodeMenuProps): MenuGroup[] {
  return [
    {
      items: [
        { label: "Foundational", icon: Quote, onClick: () => props.onExpand("foundational"), shortcut: "F" },
        { label: "Recent", icon: History, onClick: () => props.onExpand("recent"), shortcut: "R" },
        { label: "Contrasting", icon: Swords, onClick: () => props.onExpand("contrasting"), shortcut: "C" },
      ],
    },
    {
      items: [
        { label: "View details", icon: Eye, onClick: props.onViewDetails, shortcut: "Enter" },
        { label: "Find similar", icon: Search, onClick: props.onFindSimilar },
      ],
    },
    {
      items: [
        { label: "Copy title", icon: Copy, onClick: props.onCopyTitle },
        { label: "Open PDF", icon: FileText, onClick: props.onOpenPdf },
      ],
    },
    {
      items: [
        { label: "Archive", icon: Archive, onClick: props.onArchive },
        { label: "Delete", icon: Trash2, onClick: props.onDelete, danger: true },
      ],
    },
  ];
}

function buildCanvasMenuGroups(props: CanvasMenuProps): MenuGroup[] {
  return [
    {
      items: [
        { label: "Fit view", icon: Maximize, onClick: props.onFitView, shortcut: "Cmd+0" },
        { label: "Toggle minimap", icon: Map, onClick: props.onToggleMinimap },
        { label: "Auto-layout", icon: LayoutGrid, onClick: props.onAutoLayout },
      ],
    },
    {
      items: [
        { label: "Add source from URL", icon: Link2, onClick: props.onAddSource, shortcut: "⌘V" },
      ],
    },
    {
      items: [
        { label: "Clear graph", icon: Trash2, onClick: props.onClearGraph, danger: true },
      ],
    },
  ];
}
