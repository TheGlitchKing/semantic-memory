import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadSchema, validateNote, installDefaultSchema } from "../../src/core/schema.js";
import { createTempVault, cleanupTempDir } from "../setup.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

describe("schema", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempVault();
  });
  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("loadSchema", () => {
    it("returns default schema when vault has none", async () => {
      const s = await loadSchema(tempDir);
      expect(s.types.note).toBeDefined();
      expect(s.types.decision).toBeDefined();
      expect(s.types.gotcha).toBeDefined();
      expect(s.types.source).toBeDefined();
      expect(s.status_enum).toContain("active");
    });

    it("loads a user-provided vault.schema.yml", async () => {
      await writeFile(
        join(tempDir, "vault.schema.yml"),
        `version: 1
provenance_fields: [sources]
status_enum: [alpha]
confidence_enum: [high]
severity_enum: [low]
types:
  note:
    required: [title]
lint:
  missing_provenance:
    applies_to: [note]
    severity: warn
  stale:
    max_age_days: 0
    severity: warn
  schema_violations:
    severity: error
`,
        "utf-8"
      );
      const s = await loadSchema(tempDir);
      expect(s.status_enum).toEqual(["alpha"]);
      expect(s.types.note.required).toEqual(["title"]);
    });
  });

  describe("installDefaultSchema", () => {
    it("writes the default when absent", async () => {
      const r = await installDefaultSchema(tempDir);
      expect(r.written).toBe(true);
      expect(existsSync(r.path)).toBe(true);
    });
    it("does not overwrite without force", async () => {
      await installDefaultSchema(tempDir);
      const r2 = await installDefaultSchema(tempDir);
      expect(r2.written).toBe(false);
    });
    it("overwrites with force", async () => {
      await installDefaultSchema(tempDir);
      const r2 = await installDefaultSchema(tempDir, true);
      expect(r2.written).toBe(true);
    });
  });

  describe("validateNote", () => {
    it("passes a valid note", async () => {
      const s = await loadSchema(tempDir);
      const raw = `---
title: My Note
type: note
status: active
sources:
  - https://example.com
---
body`;
      const f = validateNote("ok.md", raw, s);
      expect(f).toEqual([]);
    });

    it("flags missing required fields", async () => {
      const s = await loadSchema(tempDir);
      const raw = `---
type: decision
---
no title, no status, no decided_on, no decision_maker`;
      const f = validateNote("bad.md", raw, s);
      const missing = f.filter((x) => x.rule === "schema_violations").map((x) => x.message);
      expect(missing.some((m) => m.includes("title"))).toBe(true);
      expect(missing.some((m) => m.includes("status"))).toBe(true);
      expect(missing.some((m) => m.includes("decided_on"))).toBe(true);
      expect(missing.some((m) => m.includes("decision_maker"))).toBe(true);
    });

    it("flags enum mismatch on status", async () => {
      const s = await loadSchema(tempDir);
      const raw = `---
title: x
type: note
status: published
---
body`;
      const f = validateNote("x.md", raw, s);
      expect(f.some((x) => x.message.includes("status"))).toBe(true);
    });

    it("flags unknown type", async () => {
      const s = await loadSchema(tempDir);
      const raw = `---
title: x
type: nonsense
status: active
---
body`;
      const f = validateNote("x.md", raw, s);
      expect(f.some((x) => x.message.includes("unknown type"))).toBe(true);
    });

    it("flags missing provenance on applicable type", async () => {
      const s = await loadSchema(tempDir);
      const raw = `---
title: x
type: note
status: active
---
body`;
      const f = validateNote("x.md", raw, s);
      expect(f.some((x) => x.rule === "missing_provenance")).toBe(true);
    });

    it("accepts derived_from as provenance", async () => {
      const s = await loadSchema(tempDir);
      const raw = `---
title: x
type: note
status: active
derived_from:
  - other.md
---
body`;
      const f = validateNote("x.md", raw, s);
      expect(f.some((x) => x.rule === "missing_provenance")).toBe(false);
    });

    it("flags stale last_verified", async () => {
      const s = await loadSchema(tempDir);
      const raw = `---
title: x
type: note
status: active
sources: [ok]
last_verified: 2020-01-01
---
body`;
      const f = validateNote("x.md", raw, s, { todayIso: "2026-04-21" });
      expect(f.some((x) => x.rule === "stale")).toBe(true);
    });
  });
});
