import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { regenerateAgentsContract, inspectAgentsContract, type ToolSummary } from "../../src/core/agents-contract.js";

const TOOLS: ToolSummary[] = [
  { name: "search_hybrid", description: "Combined semantic + graph search." },
  { name: "read_note", description: "Read a note." },
  { name: "find_stale", description: "[DEPRECATED — removed in v2.0.0; use lint_vault({checks:['stale']})] Stale notes.", deprecated: true },
];

describe("regenerateAgentsContract", () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agents-contract-"));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates AGENTS.md from scratch when absent", async () => {
    const result = await regenerateAgentsContract({
      projectRoot: tempDir,
      pluginVersion: "1.1.0",
      tools: TOOLS,
      nowIso: "2026-05-08T00:00:00Z",
    });
    expect(result.written).toBe(true);
    expect(result.hand_edit_detected).toBeUndefined();
    const content = await readFile(result.path, "utf-8");
    expect(content).toContain("# Project Agent Contract");
    expect(content).toContain("<!-- semantic-memory:begin contract -->");
    expect(content).toContain("<!-- semantic-memory:end contract -->");
    expect(content).toContain("## Local Notes");
    expect(content).toContain("`search_hybrid`");
    expect(content).toContain("Deprecated (removed in v2.0.0)");
    expect(content).toContain("`find_stale`");
  });

  it("preserves Local Notes content across regenerations", async () => {
    await regenerateAgentsContract({
      projectRoot: tempDir,
      pluginVersion: "1.1.0",
      tools: TOOLS,
      nowIso: "2026-05-08T00:00:00Z",
    });
    const path = join(tempDir, "AGENTS.md");
    const original = await readFile(path, "utf-8");
    const customNote = "\n- 2026-05-08: custom user-authored fact about the project.\n";
    const withLocal = original + customNote;
    await writeFile(path, withLocal, "utf-8");

    const result = await regenerateAgentsContract({
      projectRoot: tempDir,
      pluginVersion: "1.1.0",
      tools: TOOLS,
      nowIso: "2026-05-09T00:00:00Z",
    });
    expect(result.written).toBe(true);
    const updated = await readFile(path, "utf-8");
    expect(updated).toContain("custom user-authored fact about the project");
    expect(updated).toContain("last_generated: 2026-05-09T00:00:00Z");
  });

  it("refuses to write when AGENTS.md exists without managed-block markers", async () => {
    const path = join(tempDir, "AGENTS.md");
    await writeFile(path, "# Hand-rolled custom AGENTS\n\nAll mine.\n", "utf-8");
    const result = await regenerateAgentsContract({
      projectRoot: tempDir,
      pluginVersion: "1.1.0",
      tools: TOOLS,
    });
    expect(result.written).toBe(false);
    expect(result.reason).toMatch(/does not contain the semantic-memory managed-block markers/);
    const after = await readFile(path, "utf-8");
    expect(after).toBe("# Hand-rolled custom AGENTS\n\nAll mine.\n");
  });

  it("detects hand-edits inside the managed block and refuses without force", async () => {
    await regenerateAgentsContract({
      projectRoot: tempDir,
      pluginVersion: "1.1.0",
      tools: TOOLS,
      nowIso: "2026-05-08T00:00:00Z",
    });
    const path = join(tempDir, "AGENTS.md");
    const original = await readFile(path, "utf-8");
    const tampered = original.replace(
      "## Required Workflow",
      "## Required Workflow\n\nHAND EDITED INSIDE BLOCK"
    );
    await writeFile(path, tampered, "utf-8");

    const result = await regenerateAgentsContract({
      projectRoot: tempDir,
      pluginVersion: "1.1.0",
      tools: TOOLS,
      nowIso: "2026-05-08T00:00:00Z",
    });
    expect(result.written).toBe(false);
    expect(result.hand_edit_detected).toBe(true);
    const stillTampered = await readFile(path, "utf-8");
    expect(stillTampered).toContain("HAND EDITED INSIDE BLOCK");
  });

  it("overwrites hand-edits when force is true", async () => {
    await regenerateAgentsContract({
      projectRoot: tempDir,
      pluginVersion: "1.1.0",
      tools: TOOLS,
      nowIso: "2026-05-08T00:00:00Z",
    });
    const path = join(tempDir, "AGENTS.md");
    const original = await readFile(path, "utf-8");
    const tampered = original.replace(
      "## Required Workflow",
      "## Required Workflow\n\nHAND EDITED INSIDE BLOCK"
    );
    await writeFile(path, tampered, "utf-8");

    const result = await regenerateAgentsContract({
      projectRoot: tempDir,
      pluginVersion: "1.1.0",
      tools: TOOLS,
      nowIso: "2026-05-08T00:00:00Z",
      force: true,
    });
    expect(result.written).toBe(true);
    expect(result.hand_edit_detected).toBeUndefined();
    const final = await readFile(path, "utf-8");
    expect(final).not.toContain("HAND EDITED INSIDE BLOCK");
  });
});

describe("inspectAgentsContract", () => {
  let tempDir: string;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "agents-inspect-"));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports absent file", async () => {
    const r = await inspectAgentsContract(tempDir);
    expect(r.exists).toBe(false);
    expect(r.has_managed_block).toBe(false);
    expect(r.local_notes_chars).toBe(0);
  });

  it("reports a managed-block file with Local Notes preserved", async () => {
    await regenerateAgentsContract({
      projectRoot: tempDir,
      pluginVersion: "1.1.0",
      tools: TOOLS,
    });
    const path = join(tempDir, "AGENTS.md");
    const original = await readFile(path, "utf-8");
    await writeFile(path, original + "Custom local note.\n", "utf-8");
    const r = await inspectAgentsContract(tempDir);
    expect(r.exists).toBe(true);
    expect(r.has_managed_block).toBe(true);
    expect(r.local_notes_chars).toBeGreaterThan(0);
  });
});
