import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import matter from "gray-matter";
import {
  initDossier,
  listDossiers,
  findDossier,
  resolveDossierForQuery,
  appendIncident,
  setCurrentState,
  appendToSection,
  replaceSectionBody,
  dossierTemplate,
  DOSSIER_SECTIONS,
} from "../../src/core/dossier.js";

async function seedVault(): Promise<{ root: string; vault: string }> {
  const root = await mkdtemp(join(tmpdir(), "dossier-"));
  const vault = join(root, ".claude", ".vault");
  await mkdir(vault, { recursive: true });
  return { root, vault };
}

describe("dossier core", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("scaffolds a dossier with all fixed sections", async () => {
    const s = await seedVault();
    root = s.root;
    const r = await initDossier(s.vault, "payment-gateway", { aliases: ["the gateway", "payments"] });
    expect(r.created).toBe(true);
    expect(r.path).toBe("dossiers/payment-gateway.md");
    const raw = await readFile(join(s.vault, r.path), "utf-8");
    const { data, content } = matter(raw);
    expect(data.type).toBe("dossier");
    expect(data.entity).toBe("payment-gateway");
    expect(data.aliases).toEqual(["the gateway", "payments"]);
    for (const section of DOSSIER_SECTIONS) {
      expect(content).toContain(`## ${section}`);
    }
  });

  it("is a no-op when a dossier already exists for the entity", async () => {
    const s = await seedVault();
    root = s.root;
    await initDossier(s.vault, "cache-layer");
    const again = await initDossier(s.vault, "cache-layer");
    expect(again.created).toBe(false);
    expect((await listDossiers(s.vault)).length).toBe(1);
  });

  it("finds a dossier by entity name or alias (normalized)", async () => {
    const s = await seedVault();
    root = s.root;
    await initDossier(s.vault, "auth-service", { aliases: ["the login thing"] });
    const all = await listDossiers(s.vault);
    expect(findDossier(all, "auth-service")?.entity).toBe("auth-service");
    expect(findDossier(all, "The Login Thing")?.entity).toBe("auth-service");
    expect(findDossier(all, "nonexistent")).toBeUndefined();
  });

  it("resolves the longest matching alias when a query mentions several", async () => {
    const s = await seedVault();
    root = s.root;
    await initDossier(s.vault, "db", { aliases: ["database"] });
    await initDossier(s.vault, "primary-database-cluster", { aliases: ["the primary database cluster"] });
    const all = await listDossiers(s.vault);
    const hit = resolveDossierForQuery(all, "why is the primary database cluster slow");
    expect(hit?.entity).toBe("primary-database-cluster");
  });

  it("appends a dated incident, replacing the placeholder on the first entry", async () => {
    const s = await seedVault();
    root = s.root;
    await initDossier(s.vault, "queue");
    await appendIncident(s.vault, "queue", "consumer hung after redeploy → stale connection → restarted", { today: "2026-07-11" });
    let raw = await readFile(join(s.vault, "dossiers/queue.md"), "utf-8");
    expect(raw).toContain("- 2026-07-11 — consumer hung after redeploy");
    // Placeholder italic prompt should be gone.
    expect(raw).not.toContain("_Dated entries append here");
    // A second incident accretes, doesn't replace.
    await appendIncident(s.vault, "queue", "second thing happened", { today: "2026-07-12" });
    raw = await readFile(join(s.vault, "dossiers/queue.md"), "utf-8");
    expect(raw).toContain("2026-07-11 — consumer hung");
    expect(raw).toContain("2026-07-12 — second thing happened");
    // Later sections stay intact.
    expect(raw).toContain("## Current state");
  });

  it("replaces the Current state body without disturbing other sections", async () => {
    const s = await seedVault();
    root = s.root;
    await initDossier(s.vault, "worker");
    await setCurrentState(s.vault, "worker", "healthy as of the 2026-07-11 restart");
    const raw = await readFile(join(s.vault, "dossiers/worker.md"), "utf-8");
    expect(raw).toContain("healthy as of the 2026-07-11 restart");
    expect(raw).not.toContain("_The single freshest sentence");
    expect(raw).toContain("## Incident log");
    expect(raw).toContain("## Purpose");
  });

  it("returns null when appending to a nonexistent dossier", async () => {
    const s = await seedVault();
    root = s.root;
    expect(await appendIncident(s.vault, "ghost", "x")).toBeNull();
    expect(await setCurrentState(s.vault, "ghost", "x")).toBeNull();
  });

  it("compiles the derived cache + extracts purpose/current_state heads", async () => {
    const s = await seedVault();
    root = s.root;
    await initDossier(s.vault, "billing", { purpose: "Charges customers on a schedule." });
    await setCurrentState(s.vault, "billing", "stable");
    const all = await listDossiers(s.vault);
    expect(all[0].purpose).toContain("Charges customers");
    expect(all[0].current_state).toBe("stable");
  });
});

describe("section editing helpers", () => {
  const DOC = "# T\n\n## A\n\nalpha body\n\n## B\n\nbeta body\n";

  it("appendToSection inserts before the next same-level heading", () => {
    const out = appendToSection(DOC, "A", "- new line");
    expect(out).toContain("alpha body");
    expect(out).toContain("- new line");
    // new line lands inside A, before ## B
    expect(out.indexOf("- new line")).toBeLessThan(out.indexOf("## B"));
  });

  it("appendToSection creates the section at EOF when absent", () => {
    const out = appendToSection(DOC, "Nonexistent", "- x");
    expect(out).toContain("## Nonexistent");
    expect(out.trimEnd().endsWith("- x")).toBe(true);
  });

  it("replaceSectionBody swaps only the target section body", () => {
    const out = replaceSectionBody(DOC, "A", "REPLACED");
    expect(out).toContain("REPLACED");
    expect(out).not.toContain("alpha body");
    expect(out).toContain("beta body");
  });

  it("dossierTemplate seeds a purpose when given one", () => {
    expect(dossierTemplate("x", { purpose: "does a thing" })).toContain("does a thing");
    expect(dossierTemplate("x")).toContain("_What x is");
  });
});
