"use client";

import {
  ExternalLink,
  FileText,
  Globe,
  Link2,
  Quote,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useGraphStore } from "@/store/graph-store";
import {
  cn,
  formatAuthors,
  formatCount,
  sanitizeAbstractText,
} from "@/lib/utils";
import {
  deriveArxivLinks,
  isArxivUrl,
  extractDomain,
} from "@/lib/utils/arxiv-urls";
import { MarkdownRenderer } from "@/components/chat/MarkdownRenderer";
import type { PaperNode } from "@/types";

interface Props {
  node: PaperNode;
}

export function ReaderDetailsTab({ node }: Props) {
  const getNodeEdges = useGraphStore((s) => s.getNodeEdges);
  const getNode = useGraphStore((s) => s.getNode);
  const selectNode = useGraphStore((s) => s.selectNode);

  const { data: paper, scores } = node;
  const cleanTldr = paper.tldr ? sanitizeAbstractText(paper.tldr) : "";
  const cleanAbstract = paper.abstract ? sanitizeAbstractText(paper.abstract) : "";
  const cleanDescription =
    !cleanAbstract && paper.siteDescription
      ? sanitizeAbstractText(paper.siteDescription)
      : "";
  const displayAbstract = cleanAbstract || cleanDescription;
  const arxivLinks =
    paper.url && isArxivUrl(paper.url) ? deriveArxivLinks(paper.url) : null;
  const relatedEdges = getNodeEdges(node.id);
  const relatedNodes = relatedEdges
    .map((e) => {
      const otherId = e.source === node.id ? e.target : e.source;
      return getNode(otherId);
    })
    .filter(Boolean)
    .slice(0, 6);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Authors */}
        <div className="flex flex-wrap gap-1.5">
          {paper.authors.map((a) => (
            <span
              key={a.id}
              className={cn(
                "bg-[#f3f2ee] text-[#44403c] rounded-full px-3 py-1 text-xs",
                a.url && "cursor-pointer hover:bg-[#eeeee8]"
              )}
              onClick={() => a.url && window.open(a.url, "_blank")}
            >
              {a.name}
            </span>
          ))}
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-[#78716c]">
          {paper.year && <span>{paper.year}</span>}
          {paper.venue && (
            <span className="bg-[#f3f2ee] text-[#44403c] rounded-full px-3 py-1">
              {paper.venue}
            </span>
          )}
          {paper.citationCount > 0 && (
            <span>{formatCount(paper.citationCount)} citations</span>
          )}
          {paper.fieldsOfStudy?.map((f) => (
            <span
              key={f}
              className="bg-[#f3f2ee] text-[#44403c] rounded-full px-3 py-1"
            >
              {f}
            </span>
          ))}
        </div>

        {/* TLDR */}
        {cleanTldr && (
          <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#7c3aed] mb-1">
              <Quote className="w-3 h-3" />
              TL;DR
            </div>
            <MarkdownRenderer
              content={cleanTldr}
              className="text-sm text-[#44403c] leading-relaxed [&_p]:my-0 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"
            />
          </div>
        )}

        {/* Abstract */}
        {displayAbstract && (
          <div>
            <h3 className="text-xs font-medium text-[#78716c] uppercase tracking-wider mb-1.5">
              {paper.isUrlSource ? "Description" : "Abstract"}
            </h3>
            <p className="text-sm text-[#44403c] leading-relaxed whitespace-pre-wrap break-words">
              {displayAbstract}
            </p>
          </div>
        )}

        {/* ArXiv links */}
        {arxivLinks && (
          <div>
            <h3 className="text-xs font-medium text-[#78716c] uppercase tracking-wider mb-2">
              ArXiv
            </h3>
            <div className="flex flex-wrap gap-2">
              <a href={arxivLinks.pdf} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <FileText className="w-3.5 h-3.5" />
                  Open PDF
                </Button>
              </a>
              <a href={arxivLinks.html} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Globe className="w-3.5 h-3.5" />
                  Open HTML
                </Button>
              </a>
              <a href={arxivLinks.abs} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Abstract
                </Button>
              </a>
            </div>
          </div>
        )}

        {/* External links */}
        <div>
          <h3 className="text-xs font-medium text-[#78716c] uppercase tracking-wider mb-2">
            Links
          </h3>
          <div className="flex flex-wrap gap-2">
            {paper.externalIds.semanticScholarId && (
              <a
                href={`https://www.semanticscholar.org/paper/${paper.externalIds.semanticScholarId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Semantic Scholar
                </Button>
              </a>
            )}
            {paper.externalIds.doi && (
              <a
                href={`https://doi.org/${paper.externalIds.doi}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Link2 className="w-3.5 h-3.5" />
                  DOI
                </Button>
              </a>
            )}
            {paper.url && !isArxivUrl(paper.url) && (
              <a href={paper.url} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <Globe className="w-3.5 h-3.5" />
                  {extractDomain(paper.url)}
                </Button>
              </a>
            )}
          </div>
        </div>

        {/* Scores */}
        <div>
          <h3 className="text-xs font-medium text-[#78716c] uppercase tracking-wider mb-2">
            Scores
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(scores).map(([key, value]) => (
              <div
                key={key}
                className="flex items-center justify-between bg-white border border-[#e8e7e2] rounded-md px-2.5 py-1.5"
              >
                <span className="text-[10px] text-[#78716c] capitalize">
                  {key}
                </span>
                <span className="text-[10px] font-medium text-[#44403c]">
                  {(value as number).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Related in graph */}
        {relatedNodes.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-[#78716c] uppercase tracking-wider mb-2">
              Related in graph
            </h3>
            <div className="space-y-1">
              {relatedNodes.map((rn) =>
                rn ? (
                  <button
                    key={rn.id}
                    onClick={() => selectNode(rn.id)}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-[#f3f2ee] transition-colors"
                  >
                    <p className="text-xs text-[#44403c] line-clamp-1 font-paper-title">
                      {rn.data.title}
                    </p>
                    <p className="text-[10px] text-[#78716c]">
                      {formatAuthors(rn.data.authors)}{" "}
                      {rn.data.year ? `(${rn.data.year})` : ""}
                    </p>
                  </button>
                ) : null
              )}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
