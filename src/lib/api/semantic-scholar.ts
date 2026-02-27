import type { PaperMetadata, Author, ExternalIds } from "@/types";

const S2_BASE_URL = "https://api.semanticscholar.org/graph/v1";

const DEFAULT_PAPER_FIELDS = [
  "paperId",
  "corpusId",
  "externalIds",
  "title",
  "authors",
  "year",
  "abstract",
  "tldr",
  "venue",
  "citationCount",
  "referenceCount",
  "influentialCitationCount",
  "fieldsOfStudy",
  "publicationTypes",
  "openAccessPdf",
  "url",
].join(",");

const CITATION_FIELDS = [
  "paperId",
  "corpusId",
  "externalIds",
  "title",
  "authors",
  "year",
  "abstract",
  "venue",
  "citationCount",
  "referenceCount",
  "influentialCitationCount",
  "fieldsOfStudy",
  "openAccessPdf",
  "url",
].join(",");

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
  if (key) headers["x-api-key"] = key;
  return headers;
}

interface S2Author {
  authorId?: string;
  name: string;
  affiliations?: string[];
  url?: string;
}

interface S2ExternalIds {
  DOI?: string;
  ArXiv?: string;
  CorpusId?: number;
  PubMed?: string;
  DBLP?: string;
}

interface S2Paper {
  paperId: string;
  corpusId?: number;
  externalIds?: S2ExternalIds;
  title: string;
  authors?: S2Author[];
  year?: number;
  abstract?: string;
  tldr?: { text: string };
  venue?: string;
  citationCount?: number;
  referenceCount?: number;
  influentialCitationCount?: number;
  fieldsOfStudy?: string[];
  publicationTypes?: string[];
  openAccessPdf?: { url: string };
  url?: string;
  embedding?: { vector: number[] };
}

interface S2SearchResponse {
  total: number;
  offset: number;
  data: S2Paper[];
}

interface S2CitationResponse {
  offset: number;
  data: Array<{ citingPaper: S2Paper }>;
}

interface S2ReferenceResponse {
  offset: number;
  data: Array<{ citedPaper: S2Paper }>;
}

async function s2Fetch<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${S2_BASE_URL}${path}`, {
      ...options,
      headers: { ...getHeaders(), ...options?.headers },
      signal: AbortSignal.timeout(15_000),
    });

    if (res.status === 429) {
      // Rate limited - wait and retry once
      const retryAfter = parseInt(res.headers.get("retry-after") || "1", 10);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      const retry = await fetch(`${S2_BASE_URL}${path}`, {
        ...options,
        headers: { ...getHeaders(), ...options?.headers },
        signal: AbortSignal.timeout(15_000),
      });
      if (!retry.ok) {
        const text = await retry.text().catch(() => "Unknown error");
        throw new Error(`S2 API error after retry (${retry.status}): ${text}`);
      }
      return retry.json() as Promise<T>;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(`S2 API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request to Semantic Scholar timed out after 15s`);
    }
    throw err;
  }
}

function normalizeAuthor(a: S2Author): Author {
  return {
    id: a.authorId || `s2-${a.name.toLowerCase().replace(/\s+/g, "-")}`,
    name: a.name,
    affiliations: a.affiliations,
    url: a.url,
  };
}

function normalizeExternalIds(
  paperId: string,
  corpusId?: number,
  ext?: S2ExternalIds
): ExternalIds {
  return {
    semanticScholarId: paperId,
    corpusId: corpusId?.toString(),
    doi: ext?.DOI,
    arxivId: ext?.ArXiv,
    pubmedId: ext?.PubMed,
  };
}

function normalizePaper(p: S2Paper): PaperMetadata {
  return {
    id: "", // Will be assigned by paper-resolver
    externalIds: normalizeExternalIds(p.paperId, p.corpusId, p.externalIds),
    title: p.title,
    authors: (p.authors || []).map(normalizeAuthor),
    year: p.year,
    abstract: p.abstract,
    tldr: p.tldr?.text,
    venue: p.venue,
    citationCount: p.citationCount ?? 0,
    referenceCount: p.referenceCount ?? 0,
    influentialCitationCount: p.influentialCitationCount,
    fieldsOfStudy: p.fieldsOfStudy,
    publicationTypes: p.publicationTypes,
    openAccessPdf: p.openAccessPdf?.url,
    url: p.url,
    embedding: p.embedding?.vector,
  };
}

export async function searchPapers(
  query: string,
  options: { limit?: number; offset?: number; fields?: string } = {}
): Promise<{ papers: PaperMetadata[]; total: number }> {
  const { limit = 10, offset = 0, fields = DEFAULT_PAPER_FIELDS } = options;
  const params = new URLSearchParams({
    query,
    limit: limit.toString(),
    offset: offset.toString(),
    fields,
  });

  const response = await s2Fetch<S2SearchResponse>(
    `/paper/search?${params.toString()}`
  );

  return {
    papers: response.data.map(normalizePaper),
    total: response.total,
  };
}

export async function getPaper(
  paperId: string,
  fields: string = DEFAULT_PAPER_FIELDS
): Promise<PaperMetadata> {
  const params = new URLSearchParams({ fields });
  const paper = await s2Fetch<S2Paper>(
    `/paper/${encodeURIComponent(paperId)}?${params.toString()}`
  );
  return normalizePaper(paper);
}

export async function getPaperCitations(
  paperId: string,
  options: { limit?: number; offset?: number; fields?: string } = {}
): Promise<PaperMetadata[]> {
  const { limit = 50, offset = 0, fields = CITATION_FIELDS } = options;
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    fields: `citingPaper.${fields
      .split(",")
      .map((f) => f.trim())
      .join(",citingPaper.")}`,
  });

  // S2 citation fields need the nested prefix per their API spec
  const rawParams = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    fields: `contexts,intents,isInfluential,citingPaper.paperId,citingPaper.corpusId,citingPaper.externalIds,citingPaper.title,citingPaper.authors,citingPaper.year,citingPaper.abstract,citingPaper.venue,citingPaper.citationCount,citingPaper.referenceCount,citingPaper.influentialCitationCount,citingPaper.fieldsOfStudy,citingPaper.openAccessPdf,citingPaper.url`,
  });

  const response = await s2Fetch<S2CitationResponse>(
    `/paper/${encodeURIComponent(paperId)}/citations?${rawParams.toString()}`
  );

  return response.data
    .map((d) => d.citingPaper)
    .filter((p) => p.paperId)
    .map(normalizePaper);
}

export async function getPaperReferences(
  paperId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<PaperMetadata[]> {
  const { limit = 50, offset = 0 } = options;
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
    fields: `citedPaper.paperId,citedPaper.corpusId,citedPaper.externalIds,citedPaper.title,citedPaper.authors,citedPaper.year,citedPaper.abstract,citedPaper.venue,citedPaper.citationCount,citedPaper.referenceCount,citedPaper.influentialCitationCount,citedPaper.fieldsOfStudy,citedPaper.openAccessPdf,citedPaper.url`,
  });

  const response = await s2Fetch<S2ReferenceResponse>(
    `/paper/${encodeURIComponent(paperId)}/references?${params.toString()}`
  );

  return response.data
    .map((d) => d.citedPaper)
    .filter((p) => p.paperId)
    .map(normalizePaper);
}

export async function batchGetPapers(
  paperIds: string[],
  fields: string = DEFAULT_PAPER_FIELDS
): Promise<PaperMetadata[]> {
  const params = new URLSearchParams({ fields });

  const response = await s2Fetch<S2Paper[]>(
    `/paper/batch?${params.toString()}`,
    {
      method: "POST",
      body: JSON.stringify({ ids: paperIds }),
    }
  );

  return response.filter((p) => p !== null).map(normalizePaper);
}
