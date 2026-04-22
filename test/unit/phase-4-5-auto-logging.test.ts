import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applyPatch } from "../../src/core/patch.js";
import { buildSynthesizeChangeSet } from "../../src/core/synthesize.js";
import { buildIngestChangeSet } from "../../src/core/ingest.js";
import { logEvent, logQuery } from "../../src/core/log.js";
import { createTempVault, cleanupTempDir } from "../setup.js";
import { join } from "node:path";

describe("Phase 4.5 auto-logging", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempVault();
  });
  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("logEvent + logQuery round-trip writes kind=error entries durably", async () => {
    await logEvent(tempDir, {
      kind: "error",
      summary: "apply_patch failed: schema violation",
      payload: { tool: "apply_patch", errors: ["missing title"] },
    });
    const errors = await logQuery(tempDir, { kind: "error" });
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("error");
    expect(errors[0].payload?.tool).toBe("apply_patch");
  });

  it("state-delta query filters by after window correctly", async () => {
    await logEvent(tempDir, { kind: "ingest", summary: "old", ts: "2026-01-01T00:00:00Z" });
    await logEvent(tempDir, { kind: "ingest", summary: "mid", ts: "2026-04-10T00:00:00Z" });
    await logEvent(tempDir, { kind: "synthesis", summary: "recent", ts: "2026-04-22T00:00:00Z" });

    const fourteenDaysAgo = new Date("2026-04-08T00:00:00Z").toISOString();
    const recent = await logQuery(tempDir, { after: fourteenDaysAgo });
    expect(recent).toHaveLength(2);
    expect(recent.map((e) => e.summary)).toEqual(["mid", "recent"]);
  });

  it("apply_patch failure shape carries errors that the MCP wrapper can log", async () => {
    // Drive apply_patch to fail (validation error), confirm we can extract the
    // shape the server.ts wrapper uses to construct a logEvent error payload.
    const preview = buildSynthesizeChangeSet({
      topic: "x",
      answer: "body",
      suggested_path: "bad.md",
      status: "bogus-status",
    });
    const r = await applyPatch(tempDir, preview.changeset);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
    // This is the shape the server.ts auto-log extracts: { tool, errors }
    const logPayload = { tool: "synthesize_note", errors: r.errors };
    expect(logPayload.tool).toBe("synthesize_note");
    expect(Array.isArray(logPayload.errors)).toBe(true);
  });

  it("ingest_source success shape has all fields the logger needs", async () => {
    const preview = buildIngestChangeSet({
      source: { source_uri: "x://y", source_title: "Src" },
      units: [{ path: "notes/unit.md", content: "body" }],
    });
    expect(preview.sourcePath).toBeTruthy();
    expect(preview.unitPaths).toHaveLength(1);
  });

  it("log.md persists across multiple logEvent calls without corruption", async () => {
    await logEvent(tempDir, { kind: "ingest", summary: "one" });
    await logEvent(tempDir, { kind: "synthesis", summary: "two" });
    await logEvent(tempDir, { kind: "error", summary: "three" });
    await logEvent(tempDir, { kind: "mode_change", summary: "research → vault-first", payload: { from: "research", to: "vault-first" } });
    const all = await logQuery(tempDir);
    expect(all).toHaveLength(4);
    const kinds = all.map((e) => e.kind).sort();
    expect(kinds).toEqual(["error", "ingest", "mode_change", "synthesis"]);
  });
});
