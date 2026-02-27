import type { PaperMetadata, ExternalIds } from "@/types";

/**
 * Creates a stable canonical ID from a paper's external identifiers.
 * Priority: DOI > S2 ID > arXiv ID > OpenAlex ID > hash of title+year
 */
export function createCanonicalId(paper: PaperMetadata): string {
  const ids = paper.externalIds;

  if (ids.doi) return `doi:${ids.doi}`;
  if (ids.semanticScholarId) return `s2:${ids.semanticScholarId}`;
  if (ids.arxivId) return `arxiv:${ids.arxivId}`;
  if (ids.openAlexId) return `oa:${ids.openAlexId}`;
  if (ids.pubmedId) return `pmid:${ids.pubmedId}`;

  // Fallback: hash title + year for a deterministic ID
  const normalized = paper.title.toLowerCase().replace(/[^a-z0-9]/g, "");
  const yearPart = paper.year ? `-${paper.year}` : "";
  return `title:${normalized.slice(0, 60)}${yearPart}`;
}

/**
 * Converts a canonical paper ID to a Semantic Scholar query token.
 * Examples:
 * - s2:abcdef -> abcdef
 * - doi:10.1234/abc -> DOI:10.1234/abc
 */
export function canonicalIdToS2Query(canonicalId: string): string {
  if (canonicalId.startsWith("s2:")) return canonicalId.slice(3);
  if (canonicalId.startsWith("doi:")) return `DOI:${canonicalId.slice(4)}`;
  if (canonicalId.startsWith("arxiv:")) return `ARXIV:${canonicalId.slice(6)}`;
  if (canonicalId.startsWith("pmid:")) return `PMID:${canonicalId.slice(5)}`;
  return canonicalId;
}

/**
 * Checks if two papers are duplicates by comparing external IDs
 * and fuzzy matching on title+year+author.
 */
export function isDuplicate(a: PaperMetadata, b: PaperMetadata): boolean {
  // Exact ID matches
  if (a.externalIds.doi && a.externalIds.doi === b.externalIds.doi)
    return true;
  if (
    a.externalIds.arxivId &&
    a.externalIds.arxivId === b.externalIds.arxivId
  )
    return true;
  if (
    a.externalIds.semanticScholarId &&
    a.externalIds.semanticScholarId === b.externalIds.semanticScholarId
  )
    return true;
  if (
    a.externalIds.openAlexId &&
    a.externalIds.openAlexId === b.externalIds.openAlexId
  )
    return true;
  if (
    a.externalIds.corpusId &&
    a.externalIds.corpusId === b.externalIds.corpusId
  )
    return true;

  // Fuzzy title + year + first author match
  if (a.title && b.title && a.year && b.year) {
    const titleSimilarity = computeTitleSimilarity(a.title, b.title);
    const sameYear = a.year === b.year;
    const sameFirstAuthor =
      a.authors.length > 0 &&
      b.authors.length > 0 &&
      normalizeAuthorName(a.authors[0].name) ===
        normalizeAuthorName(b.authors[0].name);

    if (titleSimilarity > 0.85 && sameYear && sameFirstAuthor) return true;
    if (titleSimilarity > 0.95 && sameYear) return true;
  }

  return false;
}

/**
 * Merges two records of the same paper, preferring non-null fields
 * and taking the richer record for arrays.
 */
export function mergePapers(
  existing: PaperMetadata,
  incoming: PaperMetadata
): PaperMetadata {
  return {
    id: existing.id || createCanonicalId(existing),
    externalIds: mergeExternalIds(existing.externalIds, incoming.externalIds),
    title: existing.title || incoming.title,
    authors:
      existing.authors.length >= incoming.authors.length
        ? existing.authors
        : incoming.authors,
    year: existing.year ?? incoming.year,
    abstract:
      longerString(existing.abstract, incoming.abstract) || undefined,
    tldr: existing.tldr || incoming.tldr,
    venue: existing.venue || incoming.venue,
    citationCount: Math.max(
      existing.citationCount,
      incoming.citationCount
    ),
    referenceCount: Math.max(
      existing.referenceCount,
      incoming.referenceCount
    ),
    influentialCitationCount:
      existing.influentialCitationCount ??
      incoming.influentialCitationCount,
    fieldsOfStudy: mergeArrays(
      existing.fieldsOfStudy,
      incoming.fieldsOfStudy
    ),
    publicationTypes: mergeArrays(
      existing.publicationTypes,
      incoming.publicationTypes
    ),
    openAccessPdf: existing.openAccessPdf || incoming.openAccessPdf,
    url: existing.url || incoming.url,
    embedding: existing.embedding || incoming.embedding,
  };
}

/**
 * Resolves a paper with partial data to its canonical ID.
 * Assigns an ID if the paper doesn't have one.
 */
export function resolvePaper(paper: PaperMetadata): PaperMetadata {
  if (!paper.id) {
    return { ...paper, id: createCanonicalId(paper) };
  }
  return paper;
}

// --- Internal utilities ---

function mergeExternalIds(a: ExternalIds, b: ExternalIds): ExternalIds {
  return {
    doi: a.doi || b.doi,
    arxivId: a.arxivId || b.arxivId,
    semanticScholarId: a.semanticScholarId || b.semanticScholarId,
    corpusId: a.corpusId || b.corpusId,
    openAlexId: a.openAlexId || b.openAlexId,
    pubmedId: a.pubmedId || b.pubmedId,
  };
}

function mergeArrays(
  a: string[] | undefined,
  b: string[] | undefined
): string[] | undefined {
  if (!a && !b) return undefined;
  const set = new Set([...(a || []), ...(b || [])]);
  return Array.from(set);
}

function longerString(
  a: string | undefined,
  b: string | undefined
): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

function normalizeAuthorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple Jaccard-based title similarity.
 * Computes overlap of word sets after normalization.
 */
function computeTitleSimilarity(a: string, b: string): number {
  const wordsA = new Set(tokenize(a));
  const wordsB = new Set(tokenize(b));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}
