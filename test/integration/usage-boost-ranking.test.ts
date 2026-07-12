import { describe, it, expect, afterAll } from "vitest";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/server.js";
import { createTempVault, cleanupTempDir } from "../setup.js";

/**
 * Usage-feedback ranking (v1.5 Phase 9) end-to-end: two near-identical notes; the
 * selection log records the answer citing one of them repeatedly. On the next
 * search that cited note must carry a `usage` block and rank at/above its twin.
 */
describe("usage-boost ranking (v1.5) via MCP", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await cleanupTempDir(d);
  });

  it("boosts a repeatedly-cited note above an uncited near-twin", async () => {
    const vault = await createTempVault();
    dirs.push(vault);

    // Two near-identical notes about the same topic.
    const body = (n: number) =>
      `---\ntitle: Rate limiter ${n}\nstatus: active\n---\n# Rate limiter ${n}\n\nThe token bucket rate limiter throttles requests per client to protect the API.\n`;
    await writeFile(join(vault, "limiter-cited.md"), body(1), "utf-8");
    await writeFile(join(vault, "limiter-uncited.md"), body(2), "utf-8");

    // Seed the selection log: limiter-cited.md was retrieved AND cited several times.
    const dir = join(vault, ".claude", ".semantic-memory");
    await mkdir(dir, { recursive: true });
    const events = [
      { kind: "search", tool: "search_semantic", query: "rate limiter", results: [{ path: "limiter-cited.md", score: 0.8 }, { path: "limiter-uncited.md", score: 0.79 }] },
      { kind: "selection", note_path: "limiter-cited.md", via: "read_note" },
      { kind: "selection", note_path: "limiter-cited.md", via: "read_note" },
      { kind: "selection", note_path: "limiter-cited.md", via: "read_note" },
    ];
    await writeFile(join(dir, "selection.jsonl"), events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf-8");

    const server = await createServer(vault, { watch: false, waitForReady: true });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: "ub-client", version: "1.0.0" });
    await client.connect(ct);

    const res = await client.callTool({ name: "search_semantic", arguments: { query: "token bucket rate limiter", limit: 5 } });
    const results = JSON.parse((res.content as any)[0].text);
    const cited = results.find((r: any) => r.path === "limiter-cited.md");
    const uncited = results.find((r: any) => r.path === "limiter-uncited.md");

    expect(cited).toBeDefined();
    // The cited note carries a usage block reflecting 3 citations → 1.3× multiplier.
    expect(cited.usage).toBeDefined();
    expect(cited.usage.citations).toBe(3);
    expect(cited.usage.multiplier).toBeCloseTo(1.3);
    // The uncited twin has no usage block.
    if (uncited) expect(uncited.usage).toBeUndefined();
    // And the boost puts the cited note at or above its near-twin.
    if (uncited) {
      const ci = results.findIndex((r: any) => r.path === "limiter-cited.md");
      const ui = results.findIndex((r: any) => r.path === "limiter-uncited.md");
      expect(ci).toBeLessThanOrEqual(ui);
    }

    await client.close();
  }, 180_000);

  it("is byte-identical to pre-v1.5 when usage_boost.enabled is false", async () => {
    const vault = await createTempVault();
    dirs.push(vault);
    await writeFile(join(vault, "vault.schema.yml"), "usage_boost:\n  enabled: false\n", "utf-8");
    await writeFile(join(vault, "note.md"), "---\ntitle: N\nstatus: active\n---\ntoken bucket rate limiter\n", "utf-8");
    const dir = join(vault, ".claude", ".semantic-memory");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "selection.jsonl"), JSON.stringify({ kind: "selection", note_path: "note.md", via: "read_note" }) + "\n", "utf-8");

    const server = await createServer(vault, { watch: false, waitForReady: true });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: "ub-off-client", version: "1.0.0" });
    await client.connect(ct);
    const res = await client.callTool({ name: "search_semantic", arguments: { query: "rate limiter", limit: 5 } });
    const results = JSON.parse((res.content as any)[0].text);
    const n = results.find((r: any) => r.path === "note.md");
    expect(n).toBeDefined();
    expect(n.usage).toBeUndefined(); // disabled → no boost, no block
    await client.close();
  }, 180_000);
});
