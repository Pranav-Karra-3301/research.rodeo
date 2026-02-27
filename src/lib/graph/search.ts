import type { PaperNode } from "@/types";

export interface SearchHit {
  nodeId: string;
  score: number;
  matchField: "title" | "abstract" | "notes" | "authors" | "venue";
  snippet?: string;
}

/**
 * Client-side fuzzy search within the current graph nodes.
 * Scores matches across multiple fields with different weights.
 */
export function searchWithinGraph(
  query: string,
  nodes: Map<string, PaperNode>,
  maxResults = 10
): SearchHit[] {
  // Normalize query into search terms (skip very short words)
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (terms.length === 0) return [];

  const results: SearchHit[] = [];

  for (const [id, node] of nodes) {
    if (node.state === "archived") continue;

    let bestScore = 0;
    let matchField: SearchHit["matchField"] = "title";
    let snippet: string | undefined;

    // Score title matches (highest weight)
    const titleScore = scoreMatch(node.data.title, terms) * 3;
    if (titleScore > bestScore) {
      bestScore = titleScore;
      matchField = "title";
      snippet = node.data.title;
    }

    // Score abstract matches
    if (node.data.abstract) {
      const absScore = scoreMatch(node.data.abstract, terms) * 2;
      if (absScore > bestScore) {
        bestScore = absScore;
        matchField = "abstract";
        snippet = extractSnippet(node.data.abstract, terms);
      }
    }

    // Score notes
    if (node.userNotes) {
      const noteScore = scoreMatch(node.userNotes, terms) * 1.5;
      if (noteScore > bestScore) {
        bestScore = noteScore;
        matchField = "notes";
        snippet = extractSnippet(node.userNotes, terms);
      }
    }

    // Score authors
    const authorText = node.data.authors.map((a) => a.name).join(" ");
    const authScore = scoreMatch(authorText, terms);
    if (authScore > bestScore) {
      bestScore = authScore;
      matchField = "authors";
      snippet = authorText;
    }

    // Score venue
    if (node.data.venue) {
      const venueScore = scoreMatch(node.data.venue, terms);
      if (venueScore > bestScore) {
        bestScore = venueScore;
        matchField = "venue";
        snippet = node.data.venue;
      }
    }

    if (bestScore > 0) {
      results.push({ nodeId: id, score: bestScore, matchField, snippet });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

/**
 * Score how well a text matches the given search terms.
 * Returns a value between 0 and 1.
 */
function scoreMatch(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  let matches = 0;
  for (const term of terms) {
    if (lower.includes(term)) matches++;
  }
  return matches / terms.length;
}

/**
 * Extract a snippet around the first matching term.
 */
function extractSnippet(
  text: string,
  terms: string[],
  contextLen = 80
): string {
  const lower = text.toLowerCase();
  let earliestIdx = -1;

  for (const term of terms) {
    const idx = lower.indexOf(term);
    if (idx >= 0 && (earliestIdx < 0 || idx < earliestIdx)) {
      earliestIdx = idx;
    }
  }

  if (earliestIdx < 0) return text.slice(0, contextLen * 2);

  const start = Math.max(0, earliestIdx - contextLen);
  const end = Math.min(text.length, earliestIdx + contextLen);
  let snippet = text.slice(start, end).trim();
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}
