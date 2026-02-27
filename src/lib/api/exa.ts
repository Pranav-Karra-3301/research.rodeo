import type { PaperMetadata, Author, ExternalIds } from "@/types";

const EXA_BASE_URL = "https://api.exa.ai";

function getApiKey(): string {
  const key = process.env.EXA_API_KEY;
  if (!key) throw new Error("EXA_API_KEY environment variable is not set");
  return key;
}

export type ExaSearchType = "auto" | "instant" | "keyword";

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

// Inline simplified helpers

function sanitizeAbstractText(text: string): string {
  return text.trim().slice(0, 1000);
}

function extractArxivId(url: string): string | undefined {
  const match = url.match(/arxiv\.org\/abs\/(\d+\.\d+)/);
  return match ? match[1] : undefined;
}

const ACADEMIC_DOMAINS_CHECK = [
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
  "biorxiv.org",
  "medrxiv.org",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "jstor.org",
  "springer.com",
  "wiley.com",
  "tandfonline.com",
  "sciencedirect.com",
];

function isAcademicUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return ACADEMIC_DOMAINS_CHECK.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
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
    type: searchType === "instant" ? "instant" : searchType === "keyword" ? "keyword" : "auto",
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
