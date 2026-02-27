"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const isInline = !match && !className;

    if (isInline) {
      return (
        <code
          className="bg-[#f3f2ee] text-[#57534e] px-1.5 py-0.5 rounded text-[0.8125rem] font-mono"
          {...props}
        >
          {children}
        </code>
      );
    }

    return (
      <div className="relative">
        {match && (
          <div className="absolute top-0 right-0 px-2 py-1 text-[10px] text-[#78716c] font-mono select-none">
            {match[1]}
          </div>
        )}
        <code className={cn("font-mono text-[0.8125rem]", className)} {...props}>
          {children}
        </code>
      </div>
    );
  },

  pre({ children }) {
    return (
      <pre className="bg-[#fafaf8] border border-[#e8e7e2] rounded-lg p-4 mb-3 overflow-x-auto">
        {children}
      </pre>
    );
  },

  a({ href, children }) {
    const isExternal = href?.startsWith("http");
    return (
      <a
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        className="text-[#44403c] hover:underline inline-flex items-center gap-0.5"
      >
        {children}
        {isExternal && <ExternalLink className="h-3 w-3 inline-block" />}
      </a>
    );
  },

  img({ src, alt }) {
    return (
      <img
        src={src}
        alt={alt || ""}
        className="rounded-lg border border-[#e8e7e2] max-w-full my-2"
      />
    );
  },

  table({ children }) {
    return (
      <div className="overflow-x-auto mb-3">
        <table className="w-full border-collapse text-sm">{children}</table>
      </div>
    );
  },

  th({ children }) {
    return (
      <th className="border border-[#dddcd7] bg-[#f3f2ee]/50 px-3 py-1.5 text-left text-xs font-semibold text-[#44403c]">
        {children}
      </th>
    );
  },

  td({ children }) {
    return (
      <td className="border border-[#e8e7e2] px-3 py-1.5 text-[#44403c]">
        {children}
      </td>
    );
  },

  blockquote({ children }) {
    return (
      <blockquote className="border-l-3 border-[#c8c7c2] pl-4 ml-0 mb-3 text-[#57534e]">
        {children}
      </blockquote>
    );
  },
};

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn("markdown-body", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
