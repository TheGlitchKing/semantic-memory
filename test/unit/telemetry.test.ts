import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEvent,
  readSelectionLog,
  telemetryEnabled,
  selectionLogPath,
  recordSearchForCorrelation,
  wasRecentlySearched,
  computeSelectionStats,
} from "../../src/core/telemetry.js";

/** Seed <root>/.claude/.vault so deriveSessionDir(vault) → <root>/.claude/.semantic-memory. */
async function seedVault(schema?: string): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(join(tmpdir(), "telemetry-"));
  const vault = join(root, ".claude", ".vault");
  await mkdir(vault, { recursive: true });
  if (schema !== undefined) await writeFile(join(vault, "vault.schema.yml"), schema, "utf-8");
  return { root, vault };
}

describe("telemetry", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("appends and reads back events as JSONL under .claude/.semantic-memory/", async () => {
    const s = await seedVault();
    root = s.root;
    await appendEvent(s.vault, { kind: "search", tool: "search_semantic", query: "q", results: [{ path: "a.md", score: 0.8, decay: 0.5 }] });
    await appendEvent(s.vault, { kind: "selection", note_path: "a.md", via: "read_note", correlated: true });
    expect(selectionLogPath(s.vault)).toContain(join(".claude", ".semantic-memory", "selection.jsonl"));
    const events = await readSelectionLog(s.vault);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "search", tool: "search_semantic" });
    expect(events[1]).toMatchObject({ kind: "selection", note_path: "a.md", correlated: true });
    expect(typeof events[0].ts).toBe("string");
  });

  it("respects the opt-out (telemetry.enabled: false) — writes nothing", async () => {
    const s = await seedVault("telemetry:\n  enabled: false\n");
    root = s.root;
    expect(telemetryEnabled(s.vault)).toBe(false);
    await appendEvent(s.vault, { kind: "selection", note_path: "a.md", via: "read_note" });
    expect(existsSync(selectionLogPath(s.vault))).toBe(false);
    expect(await readSelectionLog(s.vault)).toEqual([]);
  });

  it("defaults to enabled when there is no telemetry block", async () => {
    const s = await seedVault("version: 1\n");
    root = s.root;
    expect(telemetryEnabled(s.vault)).toBe(true);
  });

  it("never throws on a bad vault path (fire-and-forget)", async () => {
    await expect(appendEvent("/nonexistent/\0/vault", { kind: "selection", note_path: "x", via: "read_note" })).resolves.toBeUndefined();
  });

  it("correlation ring: recent top-k paths within the window, expired outside it", async () => {
    const s = await seedVault();
    root = s.root;
    const now = 1_000_000;
    recordSearchForCorrelation(s.vault, ["a.md", "b.md"], now);
    expect(wasRecentlySearched(s.vault, "a.md", now + 5_000)).toBe(true);
    expect(wasRecentlySearched(s.vault, "c.md", now + 5_000)).toBe(false);
    expect(wasRecentlySearched(s.vault, "a.md", now + 120_000)).toBe(false); // outside window
  });

  it("computeSelectionStats rolls up cited vs retrieved-never-cited", async () => {
    const s = await seedVault();
    root = s.root;
    await appendEvent(s.vault, { kind: "search", tool: "search_semantic", query: "q", results: [{ path: "used.md", score: 0.9 }, { path: "ignored.md", score: 0.7 }] });
    await appendEvent(s.vault, { kind: "selection", note_path: "used.md", via: "read_note" });
    const stats = await computeSelectionStats(s.vault);
    expect(stats.searches).toBe(1);
    expect(stats.selections).toBe(1);
    expect(stats.citedPaths["used.md"]).toBe(1);
    expect(stats.retrievedNeverCited).toEqual(["ignored.md"]);
  });

  it("the telemetry module makes no network calls (no fetch/http imports)", async () => {
    const src = await readFile(new URL("../../src/core/telemetry.ts", import.meta.url), "utf-8");
    expect(src).not.toMatch(/\bfetch\s*\(/); // no fetch() call
    expect(src).not.toMatch(/from\s+["'](node:)?(http|https|net|dgram|tls)["']/);
    expect(src).not.toMatch(/require\(["'](node:)?(http|https|net|dgram|tls)["']\)/);
  });
});
