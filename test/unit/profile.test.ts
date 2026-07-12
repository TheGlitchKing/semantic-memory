import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import {
  initSpeakerProfile,
  readSpeakerProfile,
  updateProfileSection,
  PROFILE_SECTIONS,
  SPEAKER_PROFILE_PATH,
} from "../../src/core/profile.js";

async function seedVault(): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(join(tmpdir(), "profile-"));
  const vault = join(root, ".claude", ".vault");
  await mkdir(vault, { recursive: true });
  return { root, vault };
}

describe("speaker profile core", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("scaffolds profile/speaker.md with all fixed sections + profile type", async () => {
    const s = await seedVault();
    root = s.root;
    const r = await initSpeakerProfile(s.vault, "2026-07-11");
    expect(r.created).toBe(true);
    expect(r.path).toBe(SPEAKER_PROFILE_PATH);
    const raw = await readFile(join(s.vault, SPEAKER_PROFILE_PATH), "utf-8");
    const { data, content } = matter(raw);
    expect(data.type).toBe("profile");
    expect(data.evergreen).toBe(true);
    for (const section of PROFILE_SECTIONS) expect(content).toContain(`## ${section}`);
  });

  it("is a no-op if the profile already exists", async () => {
    const s = await seedVault();
    root = s.root;
    await initSpeakerProfile(s.vault);
    expect((await initSpeakerProfile(s.vault)).created).toBe(false);
  });

  it("readSpeakerProfile drops placeholder prompts (empty profile → empty head)", async () => {
    const s = await seedVault();
    root = s.root;
    await initSpeakerProfile(s.vault);
    const p = await readSpeakerProfile(s.vault);
    expect(p).not.toBeNull();
    // Only headings survive; no italic placeholder lines.
    expect(p!.head).not.toContain("_What their words map to");
    expect(p!.head).toContain("Severity calibration");
  });

  it("update_section appends a learned line, scaffolding first if absent", async () => {
    const s = await seedVault();
    root = s.root;
    await updateProfileSection(s.vault, "Severity calibration", '"on fire" = drop everything, page immediately');
    const raw = await readFile(join(s.vault, SPEAKER_PROFILE_PATH), "utf-8");
    expect(raw).toContain('- "on fire" = drop everything');
    // Placeholder replaced by the real line.
    expect(raw).not.toContain("_What their words map to");
    const p = await readSpeakerProfile(s.vault);
    expect(p!.head).toContain('"on fire" = drop everything');
  });

  it("update_section replace swaps the whole section body", async () => {
    const s = await seedVault();
    root = s.root;
    await updateProfileSection(s.vault, "Verbosity preference", "terse first, reasoning on request", "replace");
    const raw = await readFile(join(s.vault, SPEAKER_PROFILE_PATH), "utf-8");
    expect(raw).toContain("terse first, reasoning on request");
    expect(raw).not.toContain("_How much detail they want back");
  });

  it("returns null when no profile exists", async () => {
    const s = await seedVault();
    root = s.root;
    expect(await readSpeakerProfile(s.vault)).toBeNull();
  });
});
