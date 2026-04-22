import { basename } from "node:path";
import type { ChangeSet, PatchCreate, PatchUpdate } from "./patch.js";

export interface SynthesizeNoteInput {
  topic: string;
  answer: string;
  suggested_path: string;
  type?: string;
  sources?: string[];
  derived_from?: string[];
  related_notes?: string[];
  status?: string;
  confidence?: string;
  decision_maker?: string;
  decided_on?: string;
  severity?: string;
  extra_frontmatter?: Record<string, unknown>;
}

export interface SynthesizePreview {
  changeset: ChangeSet;
  path: string;
  title: string;
}

/**
 * Convert a query answer + provenance into a ChangeSet that can be fed to applyPatch.
 * The shaped note includes provenance frontmatter and auto-inserts [[wikilinks]] for
 * any related_notes that appear as bare titles in the body.
 *
 * Does NOT write to disk — always returns a ChangeSet. Callers pass it to applyPatch.
 */
export function buildSynthesizeChangeSet(input: SynthesizeNoteInput): SynthesizePreview {
  const path = input.suggested_path.endsWith(".md") ? input.suggested_path : input.suggested_path + ".md";
  const title = input.topic.trim();
  const today = new Date().toISOString().slice(0, 10);

  const frontmatter: Record<string, unknown> = {
    title,
    type: input.type ?? "note",
    status: input.status ?? "active",
    last_verified: today,
    confidence: input.confidence ?? "medium",
    ...(input.sources && input.sources.length > 0 && { sources: input.sources }),
    ...(input.derived_from && input.derived_from.length > 0 && { derived_from: input.derived_from }),
    ...(input.decision_maker && { decision_maker: input.decision_maker }),
    ...(input.decided_on && { decided_on: input.decided_on }),
    ...(input.severity && { severity: input.severity }),
    ...(input.extra_frontmatter ?? {}),
  };

  const body = buildBody(title, input.answer, input.related_notes ?? []);

  const create: PatchCreate = { path, content: body, frontmatter };
  const changeset: ChangeSet = { creates: [create] };

  return { changeset, path, title };
}

function buildBody(title: string, answer: string, relatedNotes: string[]): string {
  let body = `# ${title}\n\n${answer.trim()}\n`;

  if (relatedNotes.length > 0) {
    body = autoWikilink(body, relatedNotes);
    const links = relatedNotes.map((r) => `- [[${wikilinkName(r)}]]`).join("\n");
    body += `\n## Related\n\n${links}\n`;
  }

  return body;
}

/**
 * For each related note, replace the first bare occurrence of its title in the body
 * with a [[wikilink]]. Conservative — only replaces whole-word matches outside code blocks.
 */
function autoWikilink(body: string, relatedNotes: string[]): string {
  // Skip content inside fenced code blocks
  const parts = body.split(/(```[\s\S]*?```)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // code block
      let out = part;
      for (const r of relatedNotes) {
        const name = wikilinkName(r);
        if (/[\[\]]/.test(out) && out.includes(`[[${name}]]`)) continue; // already linked
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(`\\b${escaped}\\b`, "i");
        out = out.replace(re, `[[${name}]]`);
      }
      return out;
    })
    .join("");
}

function wikilinkName(pathOrName: string): string {
  // "decisions/auth-migration.md" → "auth-migration"
  // "Auth Migration" → "Auth Migration"
  const base = basename(pathOrName).replace(/\.md$/, "");
  return base;
}
