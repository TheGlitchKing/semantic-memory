import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { logEvent, logQuery } from "../../src/core/log.js";
import { createTempVault, cleanupTempDir } from "../setup.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("log", () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await createTempVault();
  });
  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("creates log.md with header on first event", async () => {
    await logEvent(tempDir, { kind: "ingest", summary: "first entry" });
    const raw = await readFile(join(tempDir, "log.md"), "utf-8");
    expect(raw).toContain("# Vault Log");
    expect(raw).toContain("ingest: first entry");
    expect(raw).toContain("```yaml event");
  });

  it("appends entries without clobbering", async () => {
    await logEvent(tempDir, { kind: "ingest", summary: "one" });
    await logEvent(tempDir, { kind: "synthesis", summary: "two", payload: { count: 3 } });
    const all = await logQuery(tempDir);
    expect(all).toHaveLength(2);
    expect(all[0].kind).toBe("ingest");
    expect(all[1].kind).toBe("synthesis");
    expect(all[1].payload?.count).toBe(3);
  });

  it("filters by kind and limit", async () => {
    for (let i = 0; i < 5; i++) {
      await logEvent(tempDir, {
        kind: i % 2 === 0 ? "ingest" : "synthesis",
        summary: `entry ${i}`,
        ts: `2026-04-${String(i + 10).padStart(2, "0")}T00:00:00Z`,
      });
    }
    const synth = await logQuery(tempDir, { kind: "synthesis" });
    expect(synth.every((e) => e.kind === "synthesis")).toBe(true);

    const last2 = await logQuery(tempDir, { limit: 2 });
    expect(last2).toHaveLength(2);
    expect(last2[1].summary).toBe("entry 4");
  });

  it("filters by date range", async () => {
    await logEvent(tempDir, { kind: "x", summary: "early", ts: "2026-01-01T00:00:00Z" });
    await logEvent(tempDir, { kind: "x", summary: "mid", ts: "2026-04-21T00:00:00Z" });
    await logEvent(tempDir, { kind: "x", summary: "late", ts: "2026-12-31T00:00:00Z" });
    const r = await logQuery(tempDir, { after: "2026-04-01T00:00:00Z", before: "2026-06-01T00:00:00Z" });
    expect(r).toHaveLength(1);
    expect(r[0].summary).toBe("mid");
  });
});
