import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";

export function registerGraphTools(server: McpServer, ctx: ServerContext): void {
  server.tool(
    "backlinks",
    "Find all notes that link TO a given note",
    { path: z.string(), limit: z.coerce.number().optional().default(50) },
    async ({ path, limit }) => {
      if (ctx.getDocuments().length === 0 && ctx.getIndexState() !== "ready") return ctx.textResponse(ctx.indexingMessage());
      const results = ctx.graph.backlinks(path).slice(0, limit);
      return ctx.textResponse(JSON.stringify(results, null, 2));
    }
  );

  server.tool(
    "forwardlinks",
    "Find all notes linked FROM a given note",
    { path: z.string(), limit: z.coerce.number().optional().default(50) },
    async ({ path, limit }) => {
      if (ctx.getDocuments().length === 0 && ctx.getIndexState() !== "ready") return ctx.textResponse(ctx.indexingMessage());
      const results = ctx.graph.forwardlinks(path).slice(0, limit);
      return ctx.textResponse(JSON.stringify(results, null, 2));
    }
  );

  server.tool(
    "graph_path",
    "Find the shortest path between two notes in the knowledge graph",
    { from: z.string(), to: z.string() },
    async ({ from, to }) => {
      if (ctx.getDocuments().length === 0 && ctx.getIndexState() !== "ready") return ctx.textResponse(ctx.indexingMessage());
      const path = ctx.graph.findPath(from, to);
      if (!path) return ctx.textResponse("No path found");
      return ctx.textResponse(JSON.stringify(path));
    }
  );

  server.tool(
    "graph_statistics",
    "Knowledge graph stats — most connected nodes, orphans, density",
    {},
    async () => {
      if (ctx.getDocuments().length === 0 && ctx.getIndexState() !== "ready") return ctx.textResponse(ctx.indexingMessage());
      const stats = ctx.graph.statistics();
      return ctx.textResponse(JSON.stringify(stats, null, 2));
    }
  );
}
