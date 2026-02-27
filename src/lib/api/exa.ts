import type { PaperMetadata, Author, ExternalIds } from "@/types";
import { extractArxivId } from "@/lib/utils/arxiv-urls";
import { isAcademicUrl } from "@/lib/utils/arxiv-urls";
import { sanitizeAbstractText } from "@/lib/utils";

const EXA_BASE_URL = "https://api.exa.ai";

function getApiKey(): string {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY environment variable is not set");
  return key;
}

export type ExaSearchType = "auto" | "neural" | "instant" | "fast" | "deep" | "deep-reasoning" | "deep-max";

export interface ExaSearchOptions {
  numResults?: number;
  startPublishedDate?: string;
  endPublishedDate?: string;
  useAutoprompt?: boolean;
  searchType?: ExaSearchType;
  includeDomains?: string[];
}

interface ExaResult {
  url: string;
  title: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  score?: number;
  id: string;
}

interface ExaSearchResponse {
  results: ExaResult[];
  autopromptString?: string;
}

type ExaVerbosity = "compact" | "standard" | "full";
type ExaSection =
  | "header"
  | "navigation"
  | "banner"
  | "body"
  | "sidebar"
  | "footer"
  | "metadata";

export interface ExaContentsOptions {
  maxCharacters?: number;
  includeHtmlTags?: boolean;
  verbosity?: ExaVerbosity;
  includeSections?: ExaSection[];
  excludeSections?: ExaSection[];
  maxAgeHours?: number;
}

interface ExaContentsTextResult {
  id?: string;
  url?: string;
  text?: string;
}

interface ExaContentsResponse {
  results?: ExaContentsTextResult[];
  statuses?: Array<{
    id?: string;
    status: "success" | "error";
    error?: { tag?: string; httpStatusCode?: number | null } | null;
  }>;
}

export interface ExaEvidenceHit {
  id: string;
  url: string;
  title: string;
  publishedDate?: string;
  text?: string;
  highlights?: string[];
  score?: number;
}

async function exaFetch<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<T> {
  try {
    const res = await fetch(`${EXA_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": getApiKey(),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(`Exa API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request to Exa timed out after 15s`);
    }
    throw err;
  }
}

export async function getContents(
  urls: string[],
  options: ExaContentsOptions = {}
): Promise<ExaContentsResponse> {
  const {
    maxCharacters = 40_000,
    includeHtmlTags = false,
    verbosity,
    includeSections,
    excludeSections,
    maxAgeHours = 24,
  } = options;

  const textConfig: Record<string, unknown> = {
    maxCharacters,
    includeHtmlTags,
  };
  if (verbosity) textConfig.verbosity = verbosity;
  if (includeSections && includeSections.length > 0) {
    textConfig.includeSections = includeSections;
  }
  if (excludeSections && excludeSections.length > 0) {
    textConfig.excludeSections = excludeSections;
  }

  return exaFetch<ExaContentsResponse>("/contents", {
    urls,
    text: textConfig,
    maxAgeHours,
  });
}

export async function getContentText(
  url: string,
  options: ExaContentsOptions = {}
): Promise<{ content: string; truncated: boolean } | null> {
  const maxCharacters = options.maxCharacters ?? 40_000;
  const res = await getContents([url], { ...options, maxCharacters });
  const result =
    res.results?.find((r) => r.url === url || r.id === url) ??
    res.results?.[0];
  const status =
    res.statuses?.find(
      (s) => s.id === url || s.id === result?.url || s.id === result?.id
    ) ?? res.statuses?.[0];

  if (status?.status === "error") {
    return null;
  }

  const text = result?.text?.trim();
  if (!text) return null;

  return {
    content: text.slice(0, maxCharacters),
    truncated: text.length > maxCharacters,
  };
}

function extractExternalIds(url: string): ExternalIds {
  const ids: ExternalIds = {};
  const arxivId = extractArxivId(url);
  if (arxivId) ids.arxivId = arxivId;
  const doiMatch = url.match(/doi\.org\/(10\.\d{4,}\/[^\s]+)/);
  if (doiMatch) ids.doi = doiMatch[1];
  return ids;
}

function parseAuthors(author: string | undefined): Author[] {
  if (!author) return [];
  return author.split(/,\s*(?:and\s+)?|\s+and\s+/).map((name, i) => ({
    id: `exa-author-${name.trim().toLowerCase().replace(/\s+/g, "-")}-${i}`,
    name: name.trim(),
  }));
}

export type SourceType = "paper" | "preprint" | "web";

function classifySource(url: string): SourceType {
  if (/arxiv\.org|biorxiv\.org|medrxiv\.org/.test(url)) return "preprint";
  if (isAcademicUrl(url)) return "paper";
  return "web";
}

function normalizeExaResult(result: ExaResult): PaperMetadata & { sourceType: SourceType } {
  const externalIds = extractExternalIds(result.url);
  const year = result.publishedDate
    ? new Date(result.publishedDate).getFullYear()
    : undefined;
  const highlightsText =
    result.highlights && result.highlights.length > 0
      ? sanitizeAbstractText(result.highlights.join(" "))
      : undefined;
  const cleanedText = result.text ? sanitizeAbstractText(result.text) : undefined;
  const abstractText =
    (highlightsText && highlightsText.length >= 80
      ? highlightsText
      : undefined) ??
    (cleanedText && cleanedText.length >= 80 ? cleanedText : undefined) ??
    highlightsText ??
    cleanedText;

  return {
    id: "",
    externalIds,
    title: result.title || "Untitled",
    authors: parseAuthors(result.author),
    year,
    abstract: abstractText?.slice(0, 1000),
    citationCount: 0,
    referenceCount: 0,
    url: result.url,
    sourceType: classifySource(result.url),
  };
}

export async function searchPapers(
  query: string,
  options: ExaSearchOptions = {}
): Promise<PaperMetadata[]> {
  const {
    numResults = 10,
    startPublishedDate,
    endPublishedDate,
    useAutoprompt = true,
    searchType = "auto",
    includeDomains,
  } = options;

  const body: Record<string, unknown> = {
    query,
    numResults,
    useAutoprompt,
    type: searchType,
    category: "research paper",
    contents: {
      text: { maxCharacters: 1000 },
      highlights: { numSentences: 3 },
    },
  };

  if (includeDomains && includeDomains.length > 0) {
    body.includeDomains = includeDomains;
  }
  if (startPublishedDate) body.startPublishedDate = startPublishedDate;
  if (endPublishedDate) body.endPublishedDate = endPublishedDate;

  const response = await exaFetch<ExaSearchResponse>("/search", body);
  return response.results.map((r) => {
    const { sourceType: _, ...paper } = normalizeExaResult(r);
    return paper;
  });
}

export async function findSimilar(
  url: string,
  options: { numResults?: number } = {}
): Promise<PaperMetadata[]> {
  const { numResults = 10 } = options;

  const response = await exaFetch<ExaSearchResponse>("/findSimilar", {
    url,
    numResults,
    category: "research paper",
    contents: {
      text: { maxCharacters: 1000 },
      highlights: { numSentences: 3 },
    },
  });

  return response.results.map((r) => {
    const { sourceType: _, ...paper } = normalizeExaResult(r);
    return paper;
  });
}

const ACADEMIC_DOMAINS = [
  "arxiv.org",
  "semanticscholar.org",
  "scholar.google.com",
  "openreview.net",
  "proceedings.mlr.press",
  "aclweb.org",
  "nature.com",
  "science.org",
  "ieee.org",
  "acm.org",
];

export interface DeepSearchOptions {
  numResults?: number;
  includeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
}

export async function deepSearch(
  query: string,
  options: DeepSearchOptions = {}
): Promise<(PaperMetadata & { sourceType: SourceType })[]> {
  const {
    numResults = 20,
    includeDomains = ACADEMIC_DOMAINS,
    startPublishedDate,
    endPublishedDate,
  } = options;

  const body: Record<string, unknown> = {
    query,
    numResults,
    useAutoprompt: true,
    type: "auto",
    category: "research paper",
    includeDomains,
    contents: {
      text: { maxCharacters: 1000 },
      highlights: { numSentences: 3 },
    },
  };

  if (startPublishedDate) body.startPublishedDate = startPublishedDate;
  if (endPublishedDate) body.endPublishedDate = endPublishedDate;

  const response = await exaFetch<ExaSearchResponse>("/search", body);
  return response.results.map(normalizeExaResult);
}

export async function searchEvidence(
  query: string,
  options: ExaSearchOptions = {}
): Promise<ExaEvidenceHit[]> {
  const {
    numResults = 10,
    startPublishedDate,
    endPublishedDate,
    useAutoprompt = true,
    searchType = "auto",
    includeDomains,
  } = options;

  const body: Record<string, unknown> = {
    query,
    numResults,
    useAutoprompt,
    type: searchType,
    category: "research paper",
    contents: {
      text: { maxCharacters: 1400 },
      highlights: { numSentences: 4 },
    },
  };

  if (includeDomains && includeDomains.length > 0) {
    body.includeDomains = includeDomains;
  }
  if (startPublishedDate) body.startPublishedDate = startPublishedDate;
  if (endPublishedDate) body.endPublishedDate = endPublishedDate;

  const response = await exaFetch<ExaSearchResponse>("/search", body);
  return response.results.map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    publishedDate: r.publishedDate,
    text: r.text,
    highlights: r.highlights,
    score: r.score,
  }));
}
