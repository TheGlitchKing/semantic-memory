import { describe, it, expect, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/mcp/server.js";
import { createTempVault, cleanupTempDir } from "../setup.js";

describe("manage_profile (v1.5) via MCP", () => {
  const dirs: string[] = [];
  afterAll(async () => {
    for (const d of dirs) await cleanupTempDir(d);
  });

  function parse(res: any): any {
    return JSON.parse((res.content as any)[0].text);
  }

  it("init → update_section → get lifecycle", async () => {
    const vault = await createTempVault();
    dirs.push(vault);
    const server = await createServer(vault, { watch: false, waitForReady: true });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: "profile-client", version: "1.0.0" });
    await client.connect(ct);

    const init = parse(await client.callTool({ name: "manage_profile", arguments: { action: "init" } }));
    expect(init.created).toBe(true);
    expect(init.path).toBe("profile/speaker.md");

    await client.callTool({
      name: "manage_profile",
      arguments: { action: "update_section", section: "Severity calibration", text: '"annoying" = low priority, batch it' },
    });

    const got = parse(await client.callTool({ name: "manage_profile", arguments: { action: "get" } }));
    expect(got.content).toContain('"annoying" = low priority');
    expect(got.head).toContain('"annoying" = low priority');

    await client.close();
  }, 180_000);

  it("update_section scaffolds the profile when absent", async () => {
    const vault = await createTempVault();
    dirs.push(vault);
    const server = await createServer(vault, { watch: false, waitForReady: true });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: "profile-client2", version: "1.0.0" });
    await client.connect(ct);

    const r = parse(await client.callTool({
      name: "manage_profile",
      arguments: { action: "update_section", section: "Shorthand & terms", text: '"the usual" = run tests + lint + typecheck' },
    }));
    expect(r.path).toBe("profile/speaker.md");
    const got = parse(await client.callTool({ name: "manage_profile", arguments: { action: "get" } }));
    expect(got.content).toContain("the usual");

    await client.close();
  }, 180_000);
});
