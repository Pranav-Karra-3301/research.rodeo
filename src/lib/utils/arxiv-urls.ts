/**
 * Utility functions for deriving arXiv URLs from abstract/abs links.
 *
 * Given: https://arxiv.org/abs/2509.00328
 * PDF:   https://arxiv.org/pdf/2509.00328
 * HTML:  https://arxiv.org/html/2509.00328v1
 */

const ARXIV_ABS_RE = /arxiv\.org\/abs\/(\d+\.\d+)(v\d+)?/;
const ARXIV_PDF_RE = /arxiv\.org\/pdf\/(\d+\.\d+)(v\d+)?/;
const ARXIV_HTML_RE = /arxiv\.org\/html\/(\d+\.\d+)(v\d+)?/;

export function extractArxivId(url: string): string | null {
  const match =
    url.match(ARXIV_ABS_RE) ||
    url.match(ARXIV_PDF_RE) ||
    url.match(ARXIV_HTML_RE);
  return match ? match[1] : null;
}

export function arxivAbsUrl(id: string): string {
  return `https://arxiv.org/abs/${id}`;
}

export function arxivPdfUrl(id: string): string {
  return `https://arxiv.org/pdf/${id}`;
}

export function arxivHtmlUrl(id: string, version = 1): string {
  return `https://arxiv.org/html/${id}v${version}`;
}

export function deriveArxivLinks(url: string): {
  abs: string;
  pdf: string;
  html: string;
} | null {
  const id = extractArxivId(url);
  if (!id) return null;
  return {
    abs: arxivAbsUrl(id),
    pdf: arxivPdfUrl(id),
    html: arxivHtmlUrl(id),
  };
}

/** Check if a URL is from arxiv.org */
export function isArxivUrl(url: string): boolean {
  return /arxiv\.org/.test(url);
}

/** Check if a URL points to an academic paper domain */
export function isAcademicUrl(url: string): boolean {
  const academicDomains = [
    "arxiv.org",
    "semanticscholar.org",
    "scholar.google.com",
    "doi.org",
    "pubmed.ncbi.nlm.nih.gov",
    "acm.org",
    "ieee.org",
    "springer.com",
    "nature.com",
    "science.org",
    "pnas.org",
    "biorxiv.org",
    "medrxiv.org",
    "openreview.net",
    "proceedings.mlr.press",
    "nips.cc",
    "neurips.cc",
    "aclweb.org",
    "aaai.org",
  ];
  return academicDomains.some((d) => url.includes(d));
}

/** Extract domain name for display */
export function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
