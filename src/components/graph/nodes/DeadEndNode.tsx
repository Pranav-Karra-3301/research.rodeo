"use client";

import { memo, useState } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { X } from "lucide-react";
import { ANNOTATION_COLORS } from "@/lib/design-tokens";
import type { AnnotationNodeData } from "@/types";

type DeadEndNodeType = Node<AnnotationNodeData, "dead-end">;

function DeadEndNodeInner({ data }: NodeProps<DeadEndNodeType>) {
  const { annotation, onEdit, onDelete } = data;
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const colors = ANNOTATION_COLORS["dead-end"];

  return (
    <div
      className="relative group"
      style={{ width: 140 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle
        type="source"
        position={Position.Left}
        id="left"
        className="!bg-red-400 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity"
      />

      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete?.();
          }}
          className="absolute -top-2 -right-2 z-10 w-5 h-5 flex items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm hover:bg-red-50 hover:border-red-300 transition-colors"
          aria-label="Delete node"
        >
          <X className="w-3 h-3 text-gray-500 hover:text-red-500" />
        </button>
      )}

      <div
        className="rounded-lg border-2 p-2 shadow-sm"
        style={{ backgroundColor: colors.bg, borderColor: colors.border }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <X className="w-3.5 h-3.5 shrink-0" style={{ color: colors.border }} />
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: colors.text }}>
            Dead End
          </span>
        </div>

        {editing ? (
          <textarea
            autoFocus
            className="w-full text-[11px] resize-none bg-transparent outline-none border border-red-300 rounded p-1"
            style={{ color: colors.text, minHeight: 50 }}
            defaultValue={annotation.content}
            onBlur={(e) => {
              setEditing(false);
              onEdit?.(e.target.value);
            }}
          />
        ) : (
          <p
            className="text-[11px] leading-snug cursor-text"
            style={{ color: colors.text }}
            onClick={() => setEditing(true)}
          >
            {annotation.content || <span className="opacity-50 italic">Click to add note...</span>}
          </p>
        )}
      </div>
    </div>
  );
}

export const DeadEndNode = memo(DeadEndNodeInner);
