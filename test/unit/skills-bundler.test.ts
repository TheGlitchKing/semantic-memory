import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  resolveTarget,
  installSkills,
  uninstallSkills,
  listShippedSkills,
  SKILL_BUNDLER_AGENTS,
} from "../../src/cli/skills.js";

async function seedSourceRoot(root: string) {
  // Two skills, one with a sibling reference file
  await mkdir(join(root, "skills", "vault-first"), { recursive: true });
  await writeFile(join(root, "skills", "vault-first", "SKILL.md"), "# vault-first\n", "utf-8");
  await mkdir(join(root, "skills", "research-mode", "references"), { recursive: true });
  await writeFile(join(root, "skills", "research-mode", "SKILL.md"), "# research-mode\n", "utf-8");
  await writeFile(join(root, "skills", "research-mode", "references", "notes.md"), "ref\n", "utf-8");
  // A non-skill directory to verify it's filtered out
  await mkdir(join(root, "skills", "not-a-skill"), { recursive: true });
  await writeFile(join(root, "skills", "not-a-skill", "README.md"), "no SKILL.md here\n", "utf-8");
}

describe("resolveTarget", () => {
  it("maps each agent to a known global path under HOME", () => {
    const t = resolveTarget("codex", "global", "/whatever");
    expect(t.path).toMatch(/[\\/]\.codex[\\/]skills$/);
  });

  it("maps copilot local to .github/skills under the project root", () => {
    const t = resolveTarget("copilot", "local", "/proj/X");
    expect(t.path).toBe("/proj/X/.github/skills");
  });

  it("maps pi local to .pi/skills under the project root", () => {
    const t = resolveTarget("pi", "local", "/proj/X");
    expect(t.path).toBe("/proj/X/.pi/skills");
  });
});

describe("listShippedSkills", () => {
  let src: string;
  beforeEach(async () => {
    src = await mkdtemp(join(tmpdir(), "skills-src-"));
    await seedSourceRoot(src);
  });
  afterEach(async () => {
    await rm(src, { recursive: true, force: true });
  });

  it("enumerates only directories with SKILL.md", async () => {
    const r = await listShippedSkills(src);
    const names = r.map((s) => s.name).sort();
    expect(names).toEqual(["research-mode", "vault-first"]);
  });

  it("returns empty when source root has no skills/ directory", async () => {
    const empty = await mkdtemp(join(tmpdir(), "skills-empty-"));
    try {
      const r = await listShippedSkills(empty);
      expect(r).toEqual([]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe("installSkills", () => {
  let src: string;
  let proj: string;

  beforeEach(async () => {
    src = await mkdtemp(join(tmpdir(), "skills-src-"));
    proj = await mkdtemp(join(tmpdir(), "skills-proj-"));
    await seedSourceRoot(src);
  });
  afterEach(async () => {
    await rm(src, { recursive: true, force: true });
    await rm(proj, { recursive: true, force: true });
  });

  it("installs all skills into the resolved target with manifest", async () => {
    const r = await installSkills({
      agent: "codex",
      scope: "local",
      sourceRoot: src,
      projectRoot: proj,
      version: "1.1.0",
    });
    expect(r.installed.sort()).toEqual(["research-mode", "vault-first"]);
    expect(r.target_path).toBe(join(proj, ".codex", "skills"));
    expect(existsSync(join(r.target_path, "vault-first", "SKILL.md"))).toBe(true);
    expect(existsSync(join(r.target_path, "research-mode", "SKILL.md"))).toBe(true);
    expect(existsSync(join(r.target_path, "research-mode", "references", "notes.md"))).toBe(true);
    expect(r.manifest_path).toBeDefined();
    const manifest = JSON.parse(await readFile(r.manifest_path!, "utf-8"));
    expect(manifest.package).toBe("@theglitchking/semantic-memory");
    expect(manifest.version).toBe("1.1.0");
    expect(manifest.agent).toBe("codex");
    expect(manifest.scope).toBe("local");
    expect(manifest.skills.map((s: any) => s.name).sort()).toEqual(["research-mode", "vault-first"]);
    expect(manifest.skills.every((s: any) => /^[a-f0-9]{64}$/.test(s.sha256))).toBe(true);
  });

  it("respects --only filter", async () => {
    const r = await installSkills({
      agent: "pi",
      scope: "local",
      sourceRoot: src,
      projectRoot: proj,
      version: "1.1.0",
      only: ["vault-first"],
    });
    expect(r.installed).toEqual(["vault-first"]);
    expect(existsSync(join(r.target_path, "research-mode"))).toBe(false);
  });

  it("refuses on drift without --force, succeeds with --force", async () => {
    // First install
    await installSkills({ agent: "codex", scope: "local", sourceRoot: src, projectRoot: proj, version: "1.1.0" });
    // Mutate the source so its sha shifts
    await writeFile(join(src, "skills", "vault-first", "SKILL.md"), "# vault-first v2\n", "utf-8");

    // Without --force: drift refusal
    const refused = await installSkills({ agent: "codex", scope: "local", sourceRoot: src, projectRoot: proj, version: "1.1.1" });
    expect(refused.installed).toEqual([]);
    expect(refused.reason).toMatch(/Drift detected/);

    // With --force: succeeds + new manifest
    const forced = await installSkills({ agent: "codex", scope: "local", sourceRoot: src, projectRoot: proj, version: "1.1.1", force: true });
    expect(forced.installed.sort()).toEqual(["research-mode", "vault-first"]);
    const manifest = JSON.parse(await readFile(forced.manifest_path!, "utf-8"));
    expect(manifest.version).toBe("1.1.1");
  });

  it("returns a clear reason when sourceRoot has no skills/", async () => {
    const empty = await mkdtemp(join(tmpdir(), "skills-empty-"));
    try {
      const r = await installSkills({ agent: "codex", scope: "local", sourceRoot: empty, projectRoot: proj, version: "1.1.0" });
      expect(r.installed).toEqual([]);
      expect(r.reason).toMatch(/No shipped skills found/);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe("uninstallSkills", () => {
  let src: string;
  let proj: string;

  beforeEach(async () => {
    src = await mkdtemp(join(tmpdir(), "skills-src-"));
    proj = await mkdtemp(join(tmpdir(), "skills-proj-"));
    await seedSourceRoot(src);
  });
  afterEach(async () => {
    await rm(src, { recursive: true, force: true });
    await rm(proj, { recursive: true, force: true });
  });

  it("removes only manifest-tracked skill bundles", async () => {
    const inst = await installSkills({ agent: "codex", scope: "local", sourceRoot: src, projectRoot: proj, version: "1.1.0" });
    // Add a user-authored skill alongside the managed install
    await mkdir(join(inst.target_path, "user-skill"), { recursive: true });
    await writeFile(join(inst.target_path, "user-skill", "SKILL.md"), "# user-skill\n", "utf-8");

    const u = await uninstallSkills({ agent: "codex", scope: "local", projectRoot: proj });
    expect(u.removed.sort()).toEqual(["research-mode", "vault-first"]);
    expect(u.manifest_present).toBe(true);
    // user-skill survives
    expect(existsSync(join(inst.target_path, "user-skill", "SKILL.md"))).toBe(true);
    // managed skills + manifest gone
    expect(existsSync(join(inst.target_path, "vault-first"))).toBe(false);
    expect(existsSync(join(inst.target_path, "research-mode"))).toBe(false);
    expect(existsSync(join(inst.target_path, ".semantic-memory-skill-manifest.json"))).toBe(false);
  });

  it("reports manifest_present=false when no manifest exists", async () => {
    const u = await uninstallSkills({ agent: "codex", scope: "local", projectRoot: proj });
    expect(u.manifest_present).toBe(false);
    expect(u.removed).toEqual([]);
  });
});

describe("SKILL_BUNDLER_AGENTS", () => {
  it("includes claude, codex, copilot, pi", () => {
    expect(SKILL_BUNDLER_AGENTS.sort()).toEqual(["claude", "codex", "copilot", "pi"]);
  });
});
