import type { PaperMetadata, Author } from "@/types";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const ARXIV_HTML_BASE = "https://arxiv.org/html";
const ARXIV_PDF_BASE = "https://arxiv.org/pdf";
const ARXIV_ABS_BASE = "https://arxiv.org/abs";

interface ArxivEntry {
  id: string;
  title: string;
  summary: string;
  authors: Array<{ name: string; affiliation?: string }>;
  published: string;
  updated: string;
  categories: string[];
  doi?: string;
  links: Array<{ href: string; type?: string; rel?: string; title?: string }>;
  comment?: string;
  journalRef?: string;
}

function extractArxivId(idUrl: string): string {
  // arXiv IDs in the API come as full URLs like http://arxiv.org/abs/2301.12345v1
  const match = idUrl.match(/(\d{4}\.\d{4,5})(v\d+)?$/);
  if (match) return match[1];
  // Older format: hep-th/0601234
  const oldMatch = idUrl.match(/([a-z-]+\/\d{7})/);
  if (oldMatch) return oldMatch[1];
  return idUrl;
}

function getTextContent(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim().replace(/\s+/g, " ") : "";
}

function parseEntry(entryXml: string): ArxivEntry {
  const id = getTextContent(entryXml, "id");
  const title = getTextContent(entryXml, "title");
  const summary = getTextContent(entryXml, "summary");
  const published = getTextContent(entryXml, "published");
  const updated = getTextContent(entryXml, "updated");
  const comment = getTextContent(entryXml, "arxiv:comment");
  const journalRef = getTextContent(entryXml, "arxiv:journal_ref");

  // Parse authors
  const authorRegex =
    /<author>\s*<name>([^<]+)<\/name>(?:\s*<arxiv:affiliation>([^<]*)<\/arxiv:affiliation>)?\s*<\/author>/g;
  const authors: Array<{ name: string; affiliation?: string }> = [];
  let authorMatch;
  while ((authorMatch = authorRegex.exec(entryXml)) !== null) {
    authors.push({
      name: authorMatch[1].trim(),
      affiliation: authorMatch[2]?.trim(),
    });
  }

  // Parse categories
  const catRegex = /category[^>]*term="([^"]+)"/g;
  const categories: string[] = [];
  let catMatch;
  while ((catMatch = catRegex.exec(entryXml)) !== null) {
    categories.push(catMatch[1]);
  }

  // Parse DOI
  const doiMatch = entryXml.match(
    /<arxiv:doi>([^<]+)<\/arxiv:doi>/
  );
  const doi = doiMatch ? doiMatch[1].trim() : undefined;

  // Parse links
  const linkRegex =
    /<link\s+([^>]*)\/?>/g;
  const links: Array<{
    href: string;
    type?: string;
    rel?: string;
    title?: string;
  }> = [];
  let linkMatch;
  while ((linkMatch = linkRegex.exec(entryXml)) !== null) {
    const attrs = linkMatch[1];
    const href = attrs.match(/href="([^"]+)"/)?.[1] || "";
    const type = attrs.match(/type="([^"]+)"/)?.[1];
    const rel = attrs.match(/rel="([^"]+)"/)?.[1];
    const titleAttr = attrs.match(/title="([^"]+)"/)?.[1];
    links.push({ href, type, rel, title: titleAttr });
  }

  return {
    id,
    title,
    summary,
    authors,
    published,
    updated,
    categories,
    doi,
    links,
    comment,
    journalRef,
  };
}

function parseAtomFeed(xml: string): ArxivEntry[] {
  const entries: ArxivEntry[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;
  while ((match = entryRegex.exec(xml)) !== null) {
    entries.push(parseEntry(match[1]));
  }
  return entries;
}

function normalizeEntry(entry: ArxivEntry): PaperMetadata {
  const arxivId = extractArxivId(entry.id);
  const year = entry.published
    ? new Date(entry.published).getFullYear()
    : undefined;

  const authors: Author[] = entry.authors.map((a, i) => ({
    id: `arxiv-author-${a.name.toLowerCase().replace(/\s+/g, "-")}-${i}`,
    name: a.name,
    affiliations: a.affiliation ? [a.affiliation] : undefined,
  }));

  const pdfLink = entry.links.find((l) => l.title === "pdf");
  const venue = entry.journalRef || undefined;

  return {
    id: "", // Will be assigned by paper-resolver
    externalIds: {
      arxivId,
      doi: entry.doi,
    },
    title: entry.title,
    authors,
    year,
    abstract: entry.summary,
    venue,
    citationCount: 0,
    referenceCount: 0,
    fieldsOfStudy: entry.categories.slice(0, 5),
    openAccessPdf: pdfLink?.href || `${ARXIV_PDF_BASE}/${arxivId}`,
    url: `${ARXIV_ABS_BASE}/${arxivId}`,
  };
}

export async function searchPapers(
  query: string,
  options: {
    maxResults?: number;
    start?: number;
    sortBy?: "relevance" | "lastUpdatedDate" | "submittedDate";
    sortOrder?: "ascending" | "descending";
  } = {}
): Promise<PaperMetadata[]> {
  const {
    maxResults = 10,
    start = 0,
    sortBy = "relevance",
    sortOrder = "descending",
  } = options;

  const params = new URLSearchParams({
    search_query: `all:${query}`,
    start: start.toString(),
    max_results: maxResults.toString(),
    sortBy,
    sortOrder,
  });

  const res = await fetch(`${ARXIV_API_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`arXiv API error (${res.status})`);
  }

  const xml = await res.text();
  const entries = parseAtomFeed(xml);
  return entries.map(normalizeEntry);
}

export async function getPaper(arxivId: string): Promise<PaperMetadata> {
  const params = new URLSearchParams({
    id_list: arxivId,
    max_results: "1",
  });

  const res = await fetch(`${ARXIV_API_URL}?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`arXiv API error (${res.status})`);
  }

  const xml = await res.text();
  const entries = parseAtomFeed(xml);
  if (entries.length === 0) {
    throw new Error(`arXiv paper not found: ${arxivId}`);
  }

  return normalizeEntry(entries[0]);
}

export function getFullTextUrl(arxivId: string): {
  htmlUrl: string;
  pdfUrl: string;
} {
  return {
    htmlUrl: `${ARXIV_HTML_BASE}/${arxivId}`,
    pdfUrl: `${ARXIV_PDF_BASE}/${arxivId}`,
  };
}
