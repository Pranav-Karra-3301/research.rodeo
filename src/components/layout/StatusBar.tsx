"use client";

import { useGraphStore } from "@/store/graph-store";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/utils";

export function StatusBar() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const clusters = useGraphStore((s) => s.clusters);

  const paperCount = Array.from(nodes.values()).filter(
    (n) => n.state === "materialized" || n.state === "enriched"
  ).length;

  return (
    <footer
      className={cn(
        "flex items-center justify-between px-3 h-7 shrink-0",
        "shadow-[0_-1px_0_0_#e8e7e2] bg-white text-[11px] text-[#78716c]"
      )}
    >
      <div className="flex items-center gap-4">
        <span>{formatCount(paperCount)} papers</span>
        <span>{formatCount(edges.length)} edges</span>
        <span>{clusters.length} clusters</span>
      </div>

      <div className="flex items-center gap-4">
        <ShortcutHint keys={["Cmd", "K"]} label="Search" />
        <ShortcutHint keys={["Cmd", "/"]} label="Chat" />
        <ShortcutHint keys={["Cmd", "0"]} label="Fit view" />
        <ShortcutHint keys={["Esc"]} label="Close panel" />
      </div>
    </footer>
  );
}

function ShortcutHint({
  keys,
  label,
}: {
  keys: string[];
  label: string;
}) {
  return (
    <span className="flex items-center gap-1 text-[#a8a29e]">
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex items-center rounded bg-[#f3f2ee] px-1 py-0.5 font-mono text-[10px] text-[#78716c]"
        >
          {key === "Cmd" ? "\u2318" : key}
        </kbd>
      ))}
      <span className="ml-0.5">{label}</span>
    </span>
  );
}
