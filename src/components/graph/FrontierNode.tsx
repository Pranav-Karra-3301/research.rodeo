"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GraphNodeData } from "@/types";

type FrontierNodeType = Node<GraphNodeData, "frontier">;

function FrontierNodeInner({ data }: NodeProps<FrontierNodeType>) {
  const { paper, onSelect, onMaterialize } = data;

  return (
    <div className="relative group" onClick={onSelect}>
      <Handle type="target" position={Position.Top} id="top" className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity" />
      <Handle type="target" position={Position.Left} id="left-target" className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Left} id="left-source" className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity" />
      <Handle type="target" position={Position.Right} id="right-target" className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity" />
      <Handle type="source" position={Position.Right} id="right-source" className="!bg-zinc-600 !w-1.5 !h-1.5 !border-0 !opacity-0 group-hover:!opacity-100 transition-opacity" />

      <div
        className={cn(
          "w-[176px] rounded-lg border border-dashed border-[#dddcd7]",
          "bg-[#f3f2ee]/60 p-2 opacity-40",
          "hover:opacity-70 transition-all duration-300 cursor-pointer group",
          "animate-pulse-subtle"
        )}
      >
        <h3 className="font-paper-title text-[10px] text-[#57534e] leading-tight line-clamp-2 mb-1">
          {paper.title}
        </h3>
        <p className="text-[9px] text-[#78716c]">{paper.year ?? ""}</p>

        <div className="flex justify-center mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            className="flex items-center gap-0.5 text-[9px] text-[#7c3aed] hover:text-[#6d28d9] cursor-pointer bg-transparent border-0"
            onClick={(e) => {
              e.stopPropagation();
              onMaterialize?.();
            }}
          >
            <Plus className="w-3 h-3" />
            Materialize
          </button>
        </div>
      </div>
    </div>
  );
}

export const FrontierNode = memo(FrontierNodeInner);
