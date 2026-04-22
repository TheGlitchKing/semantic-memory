import { basename } from "node:path";
import type { ChangeSet, PatchCreate } from "./patch.js";

export interface IngestSource {
  /** Identifier of the source — URL, filesystem path, DOI, ISBN, etc. */
  source_uri: string;
  /** Human-readable title for the source-note's frontmatter */
  source_title: string;
  /** One of the schema types; typically "source" */
  source_type?: string;
  /** Path under the vault to write the source-note. Defaults to `sources/<slug>.md`. */
  source_path?: string;
  /** Free-form body for the source-note (summary, abstract, your notes on it) */
  source_summary?: string;
  /** Tags for the source-note */
  source_tags?: string[];
}

export interface IngestUnit {
  /** Path under the vault where this extracted note should live */
  path: string;
  /** Note title — if absent, derived from basename */
  title?: string;
  /** Note body — markdown */
  content: string;
  /** Schema type. Default: "note". */
  type?: string;
  /** Additional wikilink-style derived_from targets beyond the source-note */
  extra_derived_from?: string[];
  /** Additional free-form frontmatter fields */
  extra_frontmatter?: Record<string, unknown>;
  /** Per-unit confidence override */
  confidence?: string;
}

export interface IngestInput {
  source: IngestSource;
  units: IngestUnit[];
  /** If true, the existing source-note is updated if present; else an error is raised */
  allow_existing_source?: boolean;
}

export interface IngestPreview {
  changeset: ChangeSet;
  sourcePath: string;
  unitPaths: string[];
}

/**
 * Build a ChangeSet for ingesting a source into the vault.
 *
 * Shape: one create for the source-note (type=source) + one create per unit,
 * each stamped with `derived_from: [<source-path>]` so lint.missing_provenance
 * is satisfied automatically and the graph reflects the provenance edge.
 *
 * Intentionally does NOT touch the filesystem — callers route the result
 * through applyPatch for atomicity, validation, and rollback.
 */
export function buildIngestChangeSet(input: IngestInput): IngestPreview {
  const today = new Date().toISOString().slice(0, 10);
  const sourcePath = input.source.source_path ?? defaultSourcePath(input.source);

  const sourceNote: PatchCreate = {
    path: sourcePath,
    content: buildSourceBody(input.source),
    frontmatter: {
      title: input.source.source_title,
      type: input.source.source_type ?? "source",
      status: "active",
      source: input.source.source_uri,
      last_verified: today,
      confidence: "high",
      ...(input.source.source_tags && input.source.source_tags.length > 0 && { tags: input.source.source_tags }),
    },
  };

  const unitCreates: PatchCreate[] = input.units.map((u) => {
    const title = u.title ?? titleFromPath(u.path);
    const derivedFrom = [sourcePath, ...(u.extra_derived_from ?? [])];
    return {
      path: u.path.endsWith(".md") ? u.path : u.path + ".md",
      content: u.content.startsWith("#") ? u.content : `# ${title}\n\n${u.content.trim()}\n`,
      frontmatter: {
        title,
        type: u.type ?? "note",
        status: "active",
        derived_from: derivedFrom,
        last_verified: today,
        confidence: u.confidence ?? "medium",
        ...(u.extra_frontmatter ?? {}),
      },
    };
  });

  return {
    changeset: { creates: [sourceNote, ...unitCreates] },
    sourcePath,
    unitPaths: unitCreates.map((c) => c.path),
  };
}

function buildSourceBody(source: IngestSource): string {
  const lines = [`# ${source.source_title}`, "", `**Source:** ${source.source_uri}`, ""];
  if (source.source_summary) {
    lines.push(source.source_summary.trim(), "");
  } else {
    lines.push("_Summary not provided — fill in when referencing this source._", "");
  }
  return lines.join("\n");
}

function defaultSourcePath(source: IngestSource): string {
  const slug = slugify(source.source_title);
  return `sources/${slug}.md`;
}

function titleFromPath(p: string): string {
  return basename(p).replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}
