import { mkdir, readFile, writeFile, copyFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

export type AgentName = "claude" | "codex" | "copilot" | "pi";
export type Scope = "global" | "local";

export interface AgentTargetSpec {
  agent: AgentName;
  scope: Scope;
  /** Absolute resolved path where the skill bundles will land. */
  path: string;
}

export interface SkillManifest {
  package: string;
  version: string;
  agent: AgentName;
  scope: Scope;
  installed_at: string;
  skills: { name: string; sha256: string }[];
}

export interface InstallResult {
  agent: AgentName;
  scope: Scope;
  target_path: string;
  installed: string[];
  skipped: string[];
  reason?: string;
  manifest_path?: string;
}

const MANIFEST_FILE = ".semantic-memory-skill-manifest.json";

/**
 * Resolve where a given (agent, scope) tuple should land. Project root is required for local
 * scope (to anchor relative paths); for global scope it's not used.
 */
export function resolveTarget(agent: AgentName, scope: Scope, projectRoot: string): AgentTargetSpec {
  const root = resolve(projectRoot);
  const home = homedir();
  const map: Record<AgentName, { global: string; local: string }> = {
    claude: { global: join(home, ".claude", "skills"), local: join(root, ".claude", "skills") },
    codex: { global: join(home, ".codex", "skills"), local: join(root, ".codex", "skills") },
    copilot: { global: join(home, ".copilot", "skills"), local: join(root, ".github", "skills") },
    pi: { global: join(home, ".pi", "agent", "skills"), local: join(root, ".pi", "skills") },
  };
  return { agent, scope, path: map[agent][scope] };
}

/**
 * Enumerate the canonical skill bundles shipped by this plugin. Each bundle is a directory
 * under `<sourceRoot>/skills/` containing at least a SKILL.md file. Entries without
 * SKILL.md are silently skipped (allows future non-skill files like `/skills/.gitkeep`).
 */
export async function listShippedSkills(sourceRoot: string): Promise<{ name: string; dir: string }[]> {
  const skillsDir = join(sourceRoot, "skills");
  if (!existsSync(skillsDir)) return [];
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const out: { name: string; dir: string }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(skillsDir, e.name);
    const skillFile = join(dir, "SKILL.md");
    if (!existsSync(skillFile)) continue;
    out.push({ name: e.name, dir });
  }
  return out;
}

async function sha256OfFile(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Copy a single skill bundle (SKILL.md plus any sibling files in the same directory) into
 * the target directory, overlaying it with the agent name. Returns the list of files written.
 *
 * The target layout is `<targetPath>/<skillName>/SKILL.md` plus mirrored siblings, so each
 * bundle is namespaced and easy to remove later.
 */
async function copyBundle(srcDir: string, destDir: string): Promise<string[]> {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  const written: string[] = [];
  for (const e of entries) {
    const src = join(srcDir, e.name);
    const dest = join(destDir, e.name);
    if (e.isDirectory()) {
      const childWritten = await copyBundle(src, dest);
      written.push(...childWritten);
      continue;
    }
    if (!e.isFile()) continue;
    await copyFile(src, dest);
    written.push(dest);
  }
  return written;
}

export interface InstallOptions {
  agent: AgentName;
  scope: Scope;
  /** Path to the package's source root (usually the repo root, where `skills/` lives). */
  sourceRoot: string;
  /** Used to anchor local-scope target paths. */
  projectRoot: string;
  /** Plugin version, recorded in the manifest. */
  version: string;
  /** Specific skills to install. When omitted, all shipped skills are installed. */
  only?: string[];
  /**
   * When false, refuse to overwrite an existing install (manifest present + sha mismatch
   * indicates upstream drift). When true, overwrite. Default false.
   */
  force?: boolean;
}

/**
 * Install all (or selected) skill bundles into an agent's skill directory.
 *
 * Behavior:
 *  - Resolves the destination via resolveTarget.
 *  - Reads any existing manifest. If a manifest exists, version differs from `version`,
 *    AND any skill sha256 differs from the source: this is a drift event. Without
 *    `force: true`, returns a refusal with reason "drift detected". With force, proceeds
 *    and overwrites.
 *  - For each shipped skill (or each in `only`), copies the bundle into
 *    <target>/<skillName>/, overwriting any existing files in that subdirectory.
 *  - Writes a fresh manifest at <target>/<MANIFEST_FILE> recording sha256 of each
 *    SKILL.md installed, the plugin version, agent, and scope.
 */
export async function installSkills(opts: InstallOptions): Promise<InstallResult> {
  const target = resolveTarget(opts.agent, opts.scope, opts.projectRoot);
  const shipped = await listShippedSkills(opts.sourceRoot);
  const filter = opts.only && opts.only.length > 0 ? new Set(opts.only) : null;
  const toInstall = filter ? shipped.filter((s) => filter.has(s.name)) : shipped;

  if (toInstall.length === 0) {
    return {
      agent: opts.agent,
      scope: opts.scope,
      target_path: target.path,
      installed: [],
      skipped: [],
      reason: filter ? `No matching skills found (only=${[...filter].join(",")}).` : "No shipped skills found at sourceRoot/skills/.",
    };
  }

  const manifestPath = join(target.path, MANIFEST_FILE);
  const existing = await readManifest(manifestPath);

  if (existing && !opts.force) {
    const drift = await detectDrift(existing, toInstall);
    if (drift.length > 0) {
      return {
        agent: opts.agent,
        scope: opts.scope,
        target_path: target.path,
        installed: [],
        skipped: toInstall.map((s) => s.name),
        reason: `Drift detected on ${drift.length} skill(s): ${drift.join(", ")}. Pass --force to overwrite.`,
        manifest_path: manifestPath,
      };
    }
  }

  await mkdir(target.path, { recursive: true });
  const installed: string[] = [];
  const skillEntries: { name: string; sha256: string }[] = [];
  for (const skill of toInstall) {
    const destDir = join(target.path, skill.name);
    await copyBundle(skill.dir, destDir);
    const skillFile = join(skill.dir, "SKILL.md");
    skillEntries.push({ name: skill.name, sha256: await sha256OfFile(skillFile) });
    installed.push(skill.name);
  }

  const manifest: SkillManifest = {
    package: "@theglitchking/semantic-memory",
    version: opts.version,
    agent: opts.agent,
    scope: opts.scope,
    installed_at: new Date().toISOString(),
    skills: skillEntries,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return {
    agent: opts.agent,
    scope: opts.scope,
    target_path: target.path,
    installed,
    skipped: [],
    manifest_path: manifestPath,
  };
}

export interface UninstallOptions {
  agent: AgentName;
  scope: Scope;
  projectRoot: string;
}

export interface UninstallResult {
  agent: AgentName;
  scope: Scope;
  target_path: string;
  removed: string[];
  manifest_present: boolean;
  reason?: string;
}

/**
 * Remove only the skill bundles tracked in the manifest. User-written skills outside
 * the manifest are left untouched.
 */
export async function uninstallSkills(opts: UninstallOptions): Promise<UninstallResult> {
  const target = resolveTarget(opts.agent, opts.scope, opts.projectRoot);
  const manifestPath = join(target.path, MANIFEST_FILE);
  const manifest = await readManifest(manifestPath);
  if (!manifest) {
    return {
      agent: opts.agent,
      scope: opts.scope,
      target_path: target.path,
      removed: [],
      manifest_present: false,
      reason: "No semantic-memory manifest found — nothing to uninstall.",
    };
  }
  const removed: string[] = [];
  for (const skill of manifest.skills) {
    const dir = join(target.path, skill.name);
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
      removed.push(skill.name);
    }
  }
  await rm(manifestPath, { force: true });
  return {
    agent: opts.agent,
    scope: opts.scope,
    target_path: target.path,
    removed,
    manifest_present: true,
  };
}

async function readManifest(path: string): Promise<SkillManifest | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.package !== "string") return null;
    return parsed as SkillManifest;
  } catch {
    return null;
  }
}

async function detectDrift(
  existing: SkillManifest,
  toInstall: { name: string; dir: string }[]
): Promise<string[]> {
  const driftNames: string[] = [];
  const existingByName = new Map(existing.skills.map((s) => [s.name, s.sha256]));
  for (const skill of toInstall) {
    const sourceSha = await sha256OfFile(join(skill.dir, "SKILL.md"));
    const existingSha = existingByName.get(skill.name);
    if (existingSha !== undefined && existingSha !== sourceSha) {
      driftNames.push(skill.name);
    }
  }
  return driftNames;
}

export const SKILL_BUNDLER_AGENTS: AgentName[] = ["claude", "codex", "copilot", "pi"];
