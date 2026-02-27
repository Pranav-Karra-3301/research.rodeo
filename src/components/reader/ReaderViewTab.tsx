"use client";

import { useState, useRef } from "react";
import { ExternalLink, AlertTriangle, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { PaperNode } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  node: PaperNode;
}

export function ReaderViewTab({ node }: Props) {
  const { data: paper } = node;
  // Prefer PDF viewer for PDFs; fall back to URL
  const viewUrl = paper.openAccessPdf ?? paper.url;
  const [blocked, setBlocked] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  if (!viewUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[#78716c] p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-[#a8a29e]" />
        <p className="text-sm">No URL available for this source.</p>
      </div>
    );
  }

  if (blocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-[#1c1917] mb-1">
            This site doesn&apos;t allow embedding
          </p>
          <p className="text-xs text-[#78716c] max-w-[260px]">
            Open it in a new tab to read the full content.
          </p>
        </div>
        <a href={viewUrl} target="_blank" rel="noopener noreferrer">
          <Button size="sm" className="gap-1.5 text-xs">
            <ExternalLink className="w-3.5 h-3.5" />
            Open in new tab
          </Button>
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-[#e8e7e2] bg-[#f8f7f4] shrink-0">
        {paper.faviconUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={paper.faviconUrl}
            alt=""
            className="w-3.5 h-3.5 rounded-sm shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <span className="text-[10px] text-[#78716c] truncate flex-1 font-mono">
          {viewUrl.length > 60 ? viewUrl.slice(0, 60) + "…" : viewUrl}
        </span>
        <a
          href={viewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
          title="Open in new tab"
        >
          <ExternalLink className="w-3.5 h-3.5 text-[#a8a29e] hover:text-[#44403c] transition-colors" />
        </a>
      </div>

      {/* Iframe */}
      <div className="relative flex-1 min-h-0">
        {!loaded && !blocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#f8f7f4] z-10">
            <Loader2 className="w-5 h-5 animate-spin text-violet-500/60" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={viewUrl}
          title={paper.title}
          className={cn(
            "w-full h-full border-0 bg-white",
            !loaded && "opacity-0"
          )}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
          onLoad={() => {
            setLoaded(true);
            // Detect X-Frame-Options block: the iframe loads but the document is empty
            try {
              const doc = iframeRef.current?.contentDocument;
              if (doc && doc.body && doc.body.children.length === 0) {
                setBlocked(true);
              }
            } catch {
              // cross-origin: iframe loaded with content (blocked ones throw)
              setLoaded(true);
            }
          }}
          onError={() => {
            setBlocked(true);
            setLoaded(true);
          }}
        />
      </div>
    </div>
  );
}
