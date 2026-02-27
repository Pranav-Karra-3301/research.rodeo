import { parsePersistedNotes } from "@/lib/db/graph-actions";
import type { PaperMetadata, PaperNode, Cluster, GraphEdge } from "@/types";

/**
 * Generate a BibTeX citation key from author last name and year.
 */
function makeCiteKey(paper: PaperMetadata): string {
  const firstAuthor = paper.authors[0]?.name ?? "unknown";
  const lastName = firstAuthor.split(/\s+/).pop()?.toLowerCase() ?? "unknown";
  const year = paper.year ?? "nd";
  const titleWord =
    paper.title
      .split(/\s+/)
      .find((w) => w.length > 3)
      ?.toLowerCase()
      .replace(/[^a-z]/g, "") ?? "paper";
  return `${lastName}${year}${titleWord}`;
}

/**
 * Escape special BibTeX characters.
 */
function bibtexEscape(text: string): string {
  return text
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_");
}

/**
 * Generate BibTeX entries for a list of papers.
 */
export function generateBibTeX(papers: PaperMetadata[]): string {
  return papers
    .map((paper) => {
      const key = makeCiteKey(paper);
      const authors = paper.authors.map((a) => a.name).join(" and ");
      const fields: string[] = [];

      fields.push(`  title = {${bibtexEscape(paper.title)}}`);
      if (authors) fields.push(`  author = {${bibtexEscape(authors)}}`);
      if (paper.year) fields.push(`  year = {${paper.year}}`);
      if (paper.venue) fields.push(`  journal = {${bibtexEscape(paper.venue)}}`);
      if (paper.externalIds.doi)
        fields.push(`  doi = {${paper.externalIds.doi}}`);
      if (paper.url) fields.push(`  url = {${paper.url}}`);
      if (paper.abstract)
        fields.push(
          `  abstract = {${bibtexEscape(paper.abstract.slice(0, 500))}}`
        );

      return `@article{${key},\n${fields.join(",\n")}\n}`;
    })
    .join("\n\n");
}

/**
 * Generate RIS format entries for a list of papers.
 */
export function generateRIS(papers: PaperMetadata[]): string {
  return papers
    .map((paper) => {
      const lines: string[] = [];
      lines.push("TY  - JOUR");
      lines.push(`TI  - ${paper.title}`);
      for (const author of paper.authors) {
        lines.push(`AU  - ${author.name}`);
      }
      if (paper.year) lines.push(`PY  - ${paper.year}`);
      if (paper.venue) lines.push(`JO  - ${paper.venue}`);
      if (paper.abstract) lines.push(`AB  - ${paper.abstract}`);
      if (paper.externalIds.doi) lines.push(`DO  - ${paper.externalIds.doi}`);
      if (paper.url) lines.push(`UR  - ${paper.url}`);
      lines.push("ER  - ");
      return lines.join("\n");
    })
    .join("\n\n");
}

/**
 * Generate a markdown literature review grouped by clusters.
 */
export function generateMarkdownReview(
  papers: PaperMetadata[],
  clusters?: Cluster[]
): string {
  const lines: string[] = [];
  lines.push("# Literature Review\n");

  if (clusters && clusters.length > 0) {
    const paperMap = new Map(papers.map((p) => [p.id, p]));

    for (const cluster of clusters) {
      lines.push(`## ${cluster.label}\n`);
      if (cluster.description) {
        lines.push(`${cluster.description}\n`);
      }

      const clusterPapers = cluster.nodeIds
        .map((id) => paperMap.get(id))
        .filter((p): p is PaperMetadata => p !== undefined)
        .sort((a, b) => (a.year ?? 0) - (b.year ?? 0));

      for (const paper of clusterPapers) {
        const authors =
          paper.authors.length > 0
            ? paper.authors
                .slice(0, 3)
                .map((a) => a.name)
                .join(", ") +
              (paper.authors.length > 3 ? " et al." : "")
            : "Unknown authors";
        lines.push(
          `**${paper.title}** (${authors}, ${paper.year ?? "n.d."})`
        );
        if (paper.tldr) {
          lines.push(`${paper.tldr}\n`);
        } else if (paper.abstract) {
          lines.push(`${paper.abstract.slice(0, 200)}...\n`);
        } else {
          lines.push("");
        }
      }
    }
  } else {
    // No clusters, list all papers chronologically
    const sorted = [...papers].sort(
      (a, b) => (a.year ?? 0) - (b.year ?? 0)
    );
    for (const paper of sorted) {
      const authors =
        paper.authors.length > 0
          ? paper.authors
              .slice(0, 3)
              .map((a) => a.name)
              .join(", ") +
            (paper.authors.length > 3 ? " et al." : "")
          : "Unknown authors";
      lines.push(
        `- **${paper.title}** (${authors}, ${paper.year ?? "n.d."}) - ${paper.citationCount} citations`
      );
    }
  }

  lines.push("\n---\n");
  lines.push(
    `*Generated from ${papers.length} papers on ${new Date().toLocaleDateString()}*`
  );

  return lines.join("\n");
}

/**
 * Sanitize a title for use as an Obsidian filename (remove special chars).
 */
function obsidianFilename(title: string): string {
  return title
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/**
 * Generate a single Obsidian-compatible markdown file with all papers.
 * Each paper section includes YAML-style frontmatter-like blocks and wikilinks.
 */
export function generateObsidianExport(
  nodes: Map<string, PaperNode>,
  edges: GraphEdge[],
  clusters?: Cluster[]
): string {
  const sections: string[] = [];
  const titleById = new Map<string, string>();

  // Build a title lookup
  for (const [id, node] of nodes) {
    if (node.state === "archived") continue;
    titleById.set(id, node.data.title);
  }

  // Build edge relationships
  const citesMap = new Map<string, string[]>(); // nodeId -> [target titles]
  const citedByMap = new Map<string, string[]>(); // nodeId -> [source titles]
  const similarMap = new Map<string, string[]>(); // nodeId -> [related titles]

  for (const edge of edges) {
    const sourceTitle = titleById.get(edge.source);
    const targetTitle = titleById.get(edge.target);
    if (!sourceTitle || !targetTitle) continue;

    if (edge.type === "cites") {
      if (!citesMap.has(edge.source)) citesMap.set(edge.source, []);
      citesMap.get(edge.source)!.push(targetTitle);
      if (!citedByMap.has(edge.target)) citedByMap.set(edge.target, []);
      citedByMap.get(edge.target)!.push(sourceTitle);
    } else if (edge.type === "cited-by") {
      if (!citedByMap.has(edge.source)) citedByMap.set(edge.source, []);
      citedByMap.get(edge.source)!.push(targetTitle);
      if (!citesMap.has(edge.target)) citesMap.set(edge.target, []);
      citesMap.get(edge.target)!.push(sourceTitle);
    } else if (edge.type === "semantic-similarity") {
      if (!similarMap.has(edge.source)) similarMap.set(edge.source, []);
      similarMap.get(edge.source)!.push(targetTitle);
      if (!similarMap.has(edge.target)) similarMap.set(edge.target, []);
      similarMap.get(edge.target)!.push(sourceTitle);
    }
  }

  const sortedNodes = Array.from(nodes.values())
    .filter((n) => n.state !== "archived")
    .sort((a, b) => (a.data.year ?? 0) - (b.data.year ?? 0));

  for (const node of sortedNodes) {
    const paper = node.data;
    const lines: string[] = [];

    // Frontmatter
    lines.push("---");
    lines.push(`title: "${paper.title.replace(/"/g, '\\"')}"`);
    if (paper.authors.length > 0) {
      lines.push(`authors: [${paper.authors.map((a) => `"${a.name}"`).join(", ")}]`);
    }
    if (paper.year) lines.push(`year: ${paper.year}`);
    if (paper.url) lines.push(`url: "${paper.url}"`);
    if (paper.venue) lines.push(`venue: "${paper.venue}"`);
    lines.push(`citations: ${paper.citationCount}`);

    // Parse notes + tags (handle round-trip from SpacetimeDB)
    const parsed = parsePersistedNotes(node.userNotes);
    const nodeUserNotes = parsed.notes;
    const nodeUserTags = node.userTags ?? parsed.tags;

    // Tags from cluster + fieldsOfStudy
    const tags: string[] = [];
    if (nodeUserTags.length > 0) tags.push(...nodeUserTags);
    if (paper.fieldsOfStudy) tags.push(...paper.fieldsOfStudy.map((f) => f.replace(/\s+/g, "-")));
    if (node.clusterId && clusters) {
      const cluster = clusters.find((c) => c.id === node.clusterId);
      if (cluster) tags.push(cluster.label.replace(/\s+/g, "-"));
    }
    if (tags.length > 0) {
      lines.push(`tags: [${tags.map((t) => t.toLowerCase()).join(", ")}]`);
    }

    // Wikilinks for relationships
    const cites = citesMap.get(node.id) ?? [];
    const citedBy = citedByMap.get(node.id) ?? [];
    if (cites.length > 0) {
      lines.push(`cites: [${cites.map((t) => `"[[${obsidianFilename(t)}]]"`).join(", ")}]`);
    }
    if (citedBy.length > 0) {
      lines.push(`cited_by: [${citedBy.map((t) => `"[[${obsidianFilename(t)}]]"`).join(", ")}]`);
    }

    lines.push("---");
    lines.push("");

    // Heading
    lines.push(`# ${paper.title}`);
    lines.push("");

    // Abstract
    if (paper.abstract) {
      lines.push("## Abstract");
      lines.push(paper.abstract);
      lines.push("");
    } else if (paper.tldr) {
      lines.push("## TL;DR");
      lines.push(paper.tldr);
      lines.push("");
    }

    // User notes
    if (nodeUserNotes) {
      lines.push("## Notes");
      lines.push(nodeUserNotes);
      lines.push("");
    }

    // Related section with wikilinks
    const similar = similarMap.get(node.id) ?? [];
    if (cites.length > 0 || citedBy.length > 0 || similar.length > 0) {
      lines.push("## Related");
      if (cites.length > 0) {
        lines.push(`- **Cites:** ${cites.map((t) => `[[${obsidianFilename(t)}]]`).join(", ")}`);
      }
      if (citedBy.length > 0) {
        lines.push(`- **Cited by:** ${citedBy.map((t) => `[[${obsidianFilename(t)}]]`).join(", ")}`);
      }
      if (similar.length > 0) {
        lines.push(`- **Similar:** ${similar.map((t) => `[[${obsidianFilename(t)}]]`).join(", ")}`);
      }
      lines.push("");
    }

    sections.push(lines.join("\n"));
  }

  const header = [
    "# Research Rodeo - Obsidian Export",
    "",
    `> Exported ${sortedNodes.length} sources on ${new Date().toLocaleDateString()}`,
    "",
    "---",
    "",
  ].join("\n");

  return header + sections.join("\n---\n\n");
}

/**
 * Trigger a file download in the browser.
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
