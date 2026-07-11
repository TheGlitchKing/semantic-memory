import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/server.js";
import { createTempVault, cleanupTempDir } from "../setup.js";
import { runEval, parseGolden, formatReport, type SearchFn, type EvalMetrics } from "./eval.js";

/**
 * Integration eval — drives the golden set through the REAL search stack
 * (search_semantic, incl. decay + priority) against a copy of the fixtures vault.
 * Reports recall@k + MRR. Non-blocking initially: it asserts only that the harness
 * ran and search returns *something* — it does NOT gate on the terse-case scores
 * the resident-expert arc is meant to improve. Promote to a tighter floor once the
 * arc's query-expansion phases land (see .planning/v14-resident-expert).
 */
describe("Retrieval eval (golden set vs fixtures vault)", () => {
  let client: Client;
  let tempDir: string;
  let metrics: EvalMetrics;

  beforeAll(async () => {
    tempDir = await createTempVault();
    const server = await createServer(tempDir, { watch: false, waitForReady: true });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    client = new Client({ name: "eval-client", version: "1.0.0" });
    await client.connect(ct);

    const search: SearchFn = async (query, limit) => {
      const res = await client.callTool({ name: "search_semantic", arguments: { query, limit } });
      const text = (res.content as any)[0].text;
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map((r: any) => r.path) : [];
    };

    const golden = parseGolden(await readFile(join(import.meta.dirname, "golden.jsonl"), "utf-8"));
    metrics = await runEval(golden, search, [1, 3, 5]);
    // Surface the report — stderr so it survives vitest's console capture.
    process.stderr.write("\n" + formatReport(metrics) + "\n\n");
  }, 180_000);

  afterAll(async () => {
    await client?.close();
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("runs every golden case through the real ranking", () => {
    expect(metrics.n).toBe(14);
    expect(metrics.cases).toHaveLength(14);
  });

  it("search returns useful results (breakage guard — not a tight gate)", () => {
    // A gross-breakage guard only. The arc will push these up; terse cases may
    // still miss today, which is the whole point of measuring them.
    expect(metrics.recallAtK[5]).toBeGreaterThan(0);
    expect(metrics.mrr).toBeGreaterThan(0);
  });
});
