"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Compass, History, Quote, Swords,
  Archive, Maximize, Map, LayoutGrid,
  Trash2, Lightbulb, X, Star, HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnnotations } from "@/hooks/useAnnotations";
import type { ExpansionMode } from "@/types";

interface MenuPosition { x: number; y: number }

interface NodeMenuProps {
  type: "node";
  position: MenuPosition;
  nodeId: string;
  nodeTitle: string;
  onExpand: (mode: ExpansionMode) => void;
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
  onClose: () => void;
}

type ContextMenuProps = NodeMenuProps | CanvasMenuProps;

interface MenuItem {
  label: string;
  icon: typeof Compass;
  onClick: () => void;
  danger?: boolean;
}

export function GraphContextMenu(props: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { addInsight, addDeadEnd, addKeyFind, addQuestion } = useAnnotations();

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

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [props]);

  const groups: MenuItem[][] = props.type === "node"
    ? buildNodeMenuGroups(props, { addInsight, addDeadEnd, addKeyFind, addQuestion })
    : buildCanvasMenuGroups(props);

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
          {group.map((item) => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); props.onClose(); }}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors",
                item.danger
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-[#44403c] hover:bg-[#f3f2ee] hover:text-[#1c1917]"
              )}
            >
              <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

function buildNodeMenuGroups(
  props: NodeMenuProps,
  annotations: {
    addInsight: (nodeId?: string) => void;
    addDeadEnd: (nodeId: string) => void;
    addKeyFind: (nodeId: string) => void;
    addQuestion: (content: string, nodeId?: string) => void;
  }
): MenuItem[][] {
  return [
    [
      { label: "Foundational", icon: Quote, onClick: () => props.onExpand("foundational") },
      { label: "Recent", icon: History, onClick: () => props.onExpand("recent") },
      { label: "Contrasting", icon: Swords, onClick: () => props.onExpand("contrasting") },
    ],
    [
      { label: "Add Insight", icon: Lightbulb, onClick: () => annotations.addInsight(props.nodeId) },
      { label: "Mark Dead End", icon: X, onClick: () => annotations.addDeadEnd(props.nodeId) },
      { label: "Mark Key Find", icon: Star, onClick: () => annotations.addKeyFind(props.nodeId) },
      { label: "Add Question", icon: HelpCircle, onClick: () => annotations.addQuestion("New question...", props.nodeId) },
    ],
    [
      { label: "Archive", icon: Archive, onClick: props.onArchive },
      { label: "Delete", icon: Trash2, onClick: props.onDelete, danger: true },
    ],
  ];
}

function buildCanvasMenuGroups(props: CanvasMenuProps): MenuItem[][] {
  return [
    [
      { label: "Fit view", icon: Maximize, onClick: props.onFitView },
      { label: "Toggle minimap", icon: Map, onClick: props.onToggleMinimap },
      { label: "Auto-layout", icon: LayoutGrid, onClick: props.onAutoLayout },
    ],
  ];
}
