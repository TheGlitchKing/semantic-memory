import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDossierForPrompt, formatDossierHead } from "../../hooks/vault-context.js";

/** Seed <root>/.claude/.semantic-memory/dossier-cache.json (what the hook reads). */
async function seedCache(dossiers: unknown[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "twohop-"));
  const dir = join(root, ".claude", ".semantic-memory");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "dossier-cache.json"), JSON.stringify({ dossiers }), "utf-8");
  return root;
}

describe("Two-hop dossier resolution (hook)", () => {
  let root: string;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("resolves an utterance to a dossier by entity name", async () => {
    root = await seedCache([
      { entity: "payment-gateway", aliases: ["the gateway"], path: "dossiers/payment-gateway.md", purpose: "Charges cards.", current_state: "healthy" },
    ]);
    const d = resolveDossierForPrompt(root, "why is the payment-gateway timing out");
    expect(d?.path).toBe("dossiers/payment-gateway.md");
  });

  it("resolves via an alias phrase, case-insensitively", async () => {
    root = await seedCache([
      { entity: "auth-service", aliases: ["the login thing"], path: "dossiers/auth-service.md", purpose: "", current_state: "" },
    ]);
    expect(resolveDossierForPrompt(root, "The Login Thing is broken again")?.entity).toBe("auth-service");
  });

  it("prefers the longest matching key across dossiers", async () => {
    root = await seedCache([
      { entity: "db", aliases: ["database"], path: "dossiers/db.md", purpose: "", current_state: "" },
      { entity: "primary-database-cluster", aliases: ["the primary database cluster"], path: "dossiers/pdc.md", purpose: "", current_state: "" },
    ]);
    expect(resolveDossierForPrompt(root, "the primary database cluster is slow")?.path).toBe("dossiers/pdc.md");
  });

  it("returns null when nothing matches or no cache exists", async () => {
    root = await seedCache([{ entity: "x", aliases: [], path: "dossiers/x.md", purpose: "", current_state: "" }]);
    expect(resolveDossierForPrompt(root, "how does auth work")).toBeNull();
    const empty = await mkdtemp(join(tmpdir(), "twohop-empty-"));
    expect(resolveDossierForPrompt(empty, "the gateway")).toBeNull();
    await rm(empty, { recursive: true, force: true });
  });

  it("formats a dossier head that leads with purpose + current state + read pointer", () => {
    const block = formatDossierHead({
      entity: "queue",
      path: "dossiers/queue.md",
      purpose: "Buffers async jobs.",
      current_state: "backed up ~2k messages",
    });
    expect(block).toContain('<vault-dossier entity="queue" path="dossiers/queue.md">');
    expect(block).toContain("purpose: Buffers async jobs.");
    expect(block).toContain("current state: backed up ~2k messages");
    expect(block).toContain("Read `dossiers/queue.md`");
    expect(block).toContain("</vault-dossier>");
  });
});
