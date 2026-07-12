import { describe, it, expect, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/server.js";
import { createTempVault, cleanupTempDir } from "../setup.js";
import { compileLexicon } from "../../src/core/lexicon.js";

/**
 * Dossier lifecycle (v1.5 Phase 8) through the real MCP server: init → append
 * incident → set state → get → list. Also proves dossier aliases fold into the
 * lexicon compiler so Tier-1 query expansion routes to the dossier.
 */
describe("manage_dossier (v1.5) via MCP", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await cleanupTempDir(d);
  });

  async function connect(vault: string): Promise<Client> {
    const server = await createServer(vault, { watch: false, waitForReady: true });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: "dossier-client", version: "1.0.0" });
    await client.connect(ct);
    return client;
  }

  function parse(res: any): any {
    return JSON.parse((res.content as any)[0].text);
  }

  it("runs the full dossier lifecycle and folds aliases into the lexicon", async () => {
    const vault = await createTempVault();
    dirs.push(vault);
    const client = await connect(vault);

    // init
    const init = parse(await client.callTool({
      name: "manage_dossier",
      arguments: { action: "init", entity: "payment-gateway", aliases: ["the gateway", "payments"], purpose: "Charges customer cards on schedule." },
    }));
    expect(init.created).toBe(true);
    expect(init.path).toBe("dossiers/payment-gateway.md");

    // append_incident
    const inc = parse(await client.callTool({
      name: "manage_dossier",
      arguments: { action: "append_incident", entity: "the gateway", incident: "timeouts under load → pool exhausted → raised pool size" },
    }));
    expect(inc.path).toBe("dossiers/payment-gateway.md");

    // set_state
    parse(await client.callTool({
      name: "manage_dossier",
      arguments: { action: "set_state", entity: "payments", state: "stable since the pool bump" },
    }));

    // get — content reflects all edits
    const got = parse(await client.callTool({
      name: "manage_dossier",
      arguments: { action: "get", entity: "payment-gateway" },
    }));
    expect(got.content).toContain("Charges customer cards");
    expect(got.content).toContain("timeouts under load");
    expect(got.content).toContain("stable since the pool bump");

    // list — one dossier, current state captured
    const list = parse(await client.callTool({ name: "manage_dossier", arguments: { action: "list" } }));
    expect(list).toHaveLength(1);
    expect(list[0].entity).toBe("payment-gateway");
    expect(list[0].current_state).toContain("stable since the pool bump");

    // lexicon fold: compiling the lexicon now includes the dossier's aliases
    const lex = await compileLexicon(vault);
    const dossierAlias = lex.find((a) => a.canonical === "dossiers/payment-gateway.md");
    expect(dossierAlias).toBeDefined();
    expect(dossierAlias!.phrases).toEqual(expect.arrayContaining(["the gateway", "payments"]));
    expect(dossierAlias!.source).toBe("authored");

    await client.close();
  }, 180_000);

  it("refuses to append to a nonexistent dossier with a clear message", async () => {
    const vault = await createTempVault();
    dirs.push(vault);
    const client = await connect(vault);
    const res = await client.callTool({
      name: "manage_dossier",
      arguments: { action: "append_incident", entity: "ghost", incident: "x" },
    });
    expect((res.content as any)[0].text).toContain("no dossier for entity: ghost");
    await client.close();
  }, 180_000);
});
