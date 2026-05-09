import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import {
  regenerateAgentsContract,
  inspectAgentsContract,
  type ToolSummary,
  type ModeSummary,
} from "../../core/agents-contract.js";
import { CURRENT_TOOL_INVENTORY } from "./inventory.js";

export function registerContractTools(server: McpServer, ctx: ServerContext): void {
  if (ctx.options.readOnly) return;

  server.tool(
    "regenerate_contract",
    "Generate or refresh AGENTS.md at the project root with a managed-block contract. Preserves the 'Local Notes' tail across regenerations. Refuses to overwrite hand-edits inside the managed block unless force=true. Returns the path written and whether hand-edits were detected.",
    {
      projectRoot: z.string().optional().describe("Override the project root path. Defaults to the parent of the vault directory if not provided."),
      force: z.boolean().optional().default(false).describe("Overwrite hand-edited managed-block content."),
    },
    async ({ projectRoot, force }) => {
      const root = projectRoot ?? defaultProjectRoot(ctx.notesPath);
      const tools: ToolSummary[] = CURRENT_TOOL_INVENTORY.map((t) => ({
        name: t.name,
        description: t.description,
        deprecated: t.deprecated,
      }));
      const modes: ModeSummary[] = [
        { name: "vault-first", description: "Project-scoped prose questions trigger vault consultation with cite-or-deflect.", isDefault: true },
        { name: "research", description: "Every source introduced is filed via ingest_source; mandatory synthesize_note on exit." },
        { name: "outage-silence", description: "No proactive vault search. Terse responses. Postmortem synthesize_note on exit." },
      ];
      const result = await regenerateAgentsContract({
        projectRoot: root,
        pluginVersion: "1.1.0",
        tools,
        modes,
        force,
      });
      return ctx.textResponse(JSON.stringify(result, null, 2));
    }
  );

  server.tool(
    "inspect_contract",
    "Read-only inspection of AGENTS.md state — whether it exists, whether the managed-block markers are present, and how much Local Notes content is preserved.",
    {
      projectRoot: z.string().optional().describe("Override the project root path. Defaults to the parent of the vault directory if not provided."),
    },
    async ({ projectRoot }) => {
      const root = projectRoot ?? defaultProjectRoot(ctx.notesPath);
      const result = await inspectAgentsContract(root);
      return ctx.textResponse(JSON.stringify(result, null, 2));
    }
  );
}

function defaultProjectRoot(notesPath: string): string {
  // Heuristic: if notesPath points at .claude/.vault, the project root is two levels up.
  // Otherwise, treat notesPath itself as the project root.
  if (notesPath.endsWith("/.claude/.vault") || notesPath.endsWith("\\.claude\\.vault")) {
    return notesPath.slice(0, -".claude/.vault".length);
  }
  return notesPath;
}
