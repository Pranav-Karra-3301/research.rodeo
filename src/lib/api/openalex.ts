import type { PaperMetadata, Author, ExternalIds } from "@/types";

const OA_BASE_URL = "https://api.openalex.org";

function getPoliteParams(): URLSearchParams {
  const params = new URLSearchParams();
  const email = process.env.OPENALEX_EMAIL;
  if (email) params.set("mailto", email);
  return params;
}

interface OAAuthor {
  author: {
    id: string;
    display_name: string;
  };
  institutions?: Array<{ display_name: string }>;
}

interface OAWork {
  id: string;
  doi?: string;
  title?: string;
  display_name?: string;
  authorships?: OAAuthor[];
  publication_year?: number;
  abstract_inverted_index?: Record<string, number[]>;
  primary_location?: {
    source?: { display_name?: string };
    landing_page_url?: string;
    pdf_url?: string;
  };
  cited_by_count?: number;
  referenced_works_count?: number;
  concepts?: Array<{ display_name: string; level: number }>;
  open_access?: { is_oa: boolean; oa_url?: string };
  ids?: {
    openalex?: string;
    doi?: string;
    pmid?: string;
  };
  type?: string;
}

interface OASearchResponse {
  results: OAWork[];
  meta: { count: number; per_page: number; page: number };
}

async function oaFetch<T>(path: string): Promise<T> {
  const url = `${OA_BASE_URL}${path}`;
  const separator = path.includes("?") ? "&" : "?";
  const polite = getPoliteParams().toString();
  const fullUrl = polite ? `${url}${separator}${polite}` : url;

  try {
    const res = await fetch(fullUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(`OpenAlex API error (${res.status}): ${text}`);
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`Request to OpenAlex timed out after 15s`);
    }
    throw err;
  }
}

function reconstructAbstract(
  invertedIndex?: Record<string, number[]>
): string | undefined {
  if (!invertedIndex) return undefined;

  const words: Array<[number, string]> = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      words.push([pos, word]);
    }
  }
  words.sort((a, b) => a[0] - b[0]);
  return words.map((w) => w[1]).join(" ");
}

function extractOpenAlexId(id: string): string {
  // OpenAlex IDs look like "https://openalex.org/W1234567890"
  const match = id.match(/W\d+/);
  return match ? match[0] : id;
}

function normalizeAuthor(a: OAAuthor): Author {
  return {
    id: a.author.id,
    name: a.author.display_name,
    affiliations: a.institutions?.map((i) => i.display_name),
  };
}

function normalizeExternalIds(work: OAWork): ExternalIds {
  const ids: ExternalIds = {};
  ids.openAlexId = extractOpenAlexId(work.id);
  if (work.doi) {
    ids.doi = work.doi.replace("https://doi.org/", "");
  }
  if (work.ids?.pmid) {
    ids.pubmedId = work.ids.pmid.replace(
      "https://pubmed.ncbi.nlm.nih.gov/",
      ""
    );
  }
  return ids;
}

function normalizeWork(work: OAWork): PaperMetadata {
  const fieldsOfStudy = work.concepts
    ?.filter((c) => c.level <= 1)
    .map((c) => c.display_name);

  return {
    id: "", // Will be assigned by paper-resolver
    externalIds: normalizeExternalIds(work),
    title: work.display_name || work.title || "Untitled",
    authors: (work.authorships || []).map(normalizeAuthor),
    year: work.publication_year,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    venue: work.primary_location?.source?.display_name,
    citationCount: work.cited_by_count ?? 0,
    referenceCount: work.referenced_works_count ?? 0,
    fieldsOfStudy,
    openAccessPdf:
      work.primary_location?.pdf_url || work.open_access?.oa_url,
    url: work.primary_location?.landing_page_url || work.doi,
  };
}

export async function searchWorks(
  query: string,
  options: { perPage?: number; page?: number } = {}
): Promise<{ papers: PaperMetadata[]; total: number }> {
  const { perPage = 10, page = 1 } = options;
  const params = new URLSearchParams({
    search: query,
    per_page: perPage.toString(),
    page: page.toString(),
  });

  const response = await oaFetch<OASearchResponse>(
    `/works?${params.toString()}`
  );

  return {
    papers: response.results.map(normalizeWork),
    total: response.meta.count,
  };
}

export async function getWork(id: string): Promise<PaperMetadata> {
  const work = await oaFetch<OAWork>(`/works/${encodeURIComponent(id)}`);
  return normalizeWork(work);
}

export async function getCitations(
  workId: string,
  options: { perPage?: number; page?: number } = {}
): Promise<PaperMetadata[]> {
  const { perPage = 50, page = 1 } = options;
  const oaId = workId.startsWith("W") ? workId : `W${workId}`;
  const params = new URLSearchParams({
    filter: `cites:${oaId}`,
    per_page: perPage.toString(),
    page: page.toString(),
  });

  const response = await oaFetch<OASearchResponse>(
    `/works?${params.toString()}`
  );
  return response.results.map(normalizeWork);
}

export async function getReferences(
  workId: string,
  options: { perPage?: number; page?: number } = {}
): Promise<PaperMetadata[]> {
  const { perPage = 50, page = 1 } = options;
  const oaId = workId.startsWith("W") ? workId : `W${workId}`;
  const params = new URLSearchParams({
    filter: `cited_by:${oaId}`,
    per_page: perPage.toString(),
    page: page.toString(),
  });

  const response = await oaFetch<OASearchResponse>(
    `/works?${params.toString()}`
  );
  return response.results.map(normalizeWork);
}
