import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format author list: "First Author et al." or "First Author, Second Author" */
export function formatAuthors(
  authors: { name: string }[],
  maxDisplay = 2
): string {
  if (authors.length === 0) return "Unknown authors";
  if (authors.length === 1) return authors[0].name;
  if (authors.length <= maxDisplay)
    return authors.map((a) => a.name).join(", ");
  return `${authors[0].name} et al.`;
}

/** Format citation count: 1234 -> "1.2k" */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

/** Truncate text to N characters with ellipsis */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

/** Format score as percentage: 0.85 -> "85%" */
export function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** Generate a short BibTeX key from author + year */
export function bibtexKey(
  firstAuthor: string | undefined,
  year: number | undefined,
  title: string
): string {
  const author = firstAuthor
    ? firstAuthor.split(/\s+/).pop()?.toLowerCase() || "unknown"
    : "unknown";
  const y = year || "nd";
  const word = title
    .split(/\s+/)
    .find((w) => w.length > 3)
    ?.toLowerCase()
    .replace(/[^a-z]/g, "") || "paper";
  return `${author}${y}${word}`;
}

/**
 * Remove common scrape artifacts from abstract/tldr text (e.g. from arXiv HTML).
 * Strips UI directive fragments, duplicated "Abstract:" prefixes, and normalizes whitespace.
 */
export function sanitizeAbstractText(text: string): string {
  let cleaned = text.replace(/\r\n?/g, "\n");

  const fragmentPatterns = [
    /\[Skip to main content\]/gi,
    /\[!\[[^\]]*\]\]/g,
    /@\w[\w.-]*(?:=(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s]+))?/g,
    /\$refs?\.[\w$]+(?:\([^)]*\))?/g,
    /\$event(?:\.[\w$]+|\([^)]*\))*/g,
    /\b(?:setQuery|handleQueryChange|handleShiftEnter)\([^)]*\)/g,
    /\bsearch[_-]?form\.submit\(\)/gi,
    /\b\d+\s*"\s*(?:papers|topics|authors)\b/gi,
    /\brecent\s*\[view all\]/gi,
    /\b\d+\s*character limit reached\b/gi,
    /<[^>]+>/g,
  ] as const;

  for (const pattern of fragmentPatterns) {
    cleaned = cleaned.replace(pattern, " ");
  }

  cleaned = cleaned.replace(
    /\b(?:on[a-z]+|maxlength|minlength|placeholder|autofocus|autocomplete|readonly|disabled|tabindex|class|id|style|value|type|role|name|for|aria-[\w-]+|data-[\w-]+)\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s]+)/gi,
    " "
  );
  cleaned = cleaned.replace(
    /\b(?:click|focus|keydown|keyup|input|change)(?:\.[\w.-]+)?\s*=\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s]+)/gi,
    " "
  );

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(?:view|details|notes|ask ai)$/i.test(line));
  cleaned = lines.join(" ");
  cleaned = cleaned
    .replace(/\s{2,}/g, " ")
    .replace(/^[`"'[\]{}()]+/, "")
    .replace(/^[\d)\].\s"]+/, "")
    .trim();

  const abstractIdx = cleaned.toLowerCase().lastIndexOf("abstract:");
  if (abstractIdx !== -1) {
    const tail = cleaned.slice(abstractIdx + "abstract:".length).trim();
    if (tail.length > 32) {
      cleaned = tail;
    }
  }

  const summaryIdx = cleaned.toLowerCase().lastIndexOf("summary:");
  if (summaryIdx !== -1) {
    const tail = cleaned.slice(summaryIdx + "summary:".length).trim();
    if (tail.length > 32) {
      cleaned = tail;
    }
  }

  return cleaned
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Debounce a function */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
