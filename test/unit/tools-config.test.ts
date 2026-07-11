import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadToolsConfig, readActiveMode, useMinimalToolSurface } from "../../src/core/tools-config.js";

async function seed(schema?: string, mode?: string): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(join(tmpdir(), "toolscfg-"));
  const vault = join(root, ".claude", ".vault");
  await mkdir(vault, { recursive: true });
  if (schema !== undefined) await writeFile(join(vault, "vault.schema.yml"), schema, "utf-8");
  if (mode !== undefined) {
    await mkdir(join(root, ".claude", ".semantic-memory"), { recursive: true });
    await writeFile(join(root, ".claude", ".semantic-memory", "mode"), mode, "utf-8");
  }
  return { root, vault };
}

describe("tools-config", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("defaults conditional to false", async () => {
    const s = await seed();
    root = s.root;
    expect(loadToolsConfig(s.vault).conditional).toBe(false);
    expect(useMinimalToolSurface(s.vault)).toBe(false);
  });

  it("reads tools.conditional and the active mode", async () => {
    const s = await seed("tools:\n  conditional: true\n", "outage-silence");
    root = s.root;
    expect(loadToolsConfig(s.vault).conditional).toBe(true);
    expect(readActiveMode(s.vault)).toBe("outage-silence");
    expect(useMinimalToolSurface(s.vault)).toBe(true);
  });

  it("stays full-surface when conditional is on but mode is not outage-silence", async () => {
    const s = await seed("tools:\n  conditional: true\n", "vault-first");
    root = s.root;
    expect(useMinimalToolSurface(s.vault)).toBe(false);
  });

  it("stays full-surface in outage mode when conditional is off", async () => {
    const s = await seed("tools:\n  conditional: false\n", "outage-silence");
    root = s.root;
    expect(useMinimalToolSurface(s.vault)).toBe(false);
  });
});
