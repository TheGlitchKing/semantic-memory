import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Watcher } from "../core/watcher.js";
import { buildContext, type ServerOptions } from "./context.js";
import { registerSearchTools } from "./tools/search.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import { registerPatchTools } from "./tools/patch.js";
import { registerLintTools } from "./tools/lint.js";
import { registerLogTools } from "./tools/log.js";
import { registerMetadataTools } from "./tools/metadata.js";
import { registerGraphTools } from "./tools/graph.js";
import { registerSystemTools } from "./tools/system.js";
import { registerContractTools } from "./tools/contract.js";

export type { ServerOptions } from "./context.js";

export async function createServer(notesPath: string, options: ServerOptions = {}) {
  const ctx = await buildContext(notesPath, options);

  const server = new McpServer({
    name: "semantic-memory",
    version: "1.0.0",
  });

  registerSearchTools(server, ctx);
  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  registerPatchTools(server, ctx);
  registerLintTools(server, ctx);
  registerLogTools(server, ctx);
  registerMetadataTools(server, ctx);
  registerGraphTools(server, ctx);
  registerSystemTools(server, ctx);
  registerContractTools(server, ctx);

  if (options.waitForReady) {
    await ctx.tryLoadCachedIndex();
    await ctx.fullIndex();
  } else {
    ctx.tryLoadCachedIndex()
      .then((cached) => {
        if (!cached) ctx.backgroundIndex();
      })
      .catch((err) => {
        process.stderr.write(`Startup error: ${err?.message ?? err}\n`);
        ctx.backgroundIndex();
      });
  }

  if (options.watch !== false) {
    const watcher = new Watcher(notesPath);
    watcher.on("changed", () => {
      ctx.backgroundIndex();
    });
    watcher.start();
  }

  return server;
}

export async function startServer(notesPath: string, options: ServerOptions = {}) {
  const server = await createServer(notesPath, options);
  const transport = new StdioServerTransport();

  // Exit when the parent process closes its end of the stdio pipe.
  //
  // This covers every "parent death" scenario: SIGKILL to Claude Code, OOM-kill,
  // session end, terminal close, remote-MCP network drop. When the parent dies
  // its end of the pipe is closed by the kernel, and the child receives EOF on
  // process.stdin (emits 'end' then 'close').
  //
  // Without these handlers the chokidar FSWatcher (inotify fd) and the ONNX
  // InferenceSession native thread-pool keep the Node.js event loop alive
  // indefinitely — producing one orphan process (~180–200 MB RSS each) per Claude
  // session. On low-memory boxes this accumulates until RAM + swap are exhausted
  // and the host freezes.
  //
  // StdioServerTransport (MCP SDK v1.29.0) only listens for 'data' and 'error'
  // on stdin; it does not call process.exit() on EOF. The McpServer class also
  // does not exit the process on transport close — both are correct library
  // behaviour. It is the application's responsibility to exit, and this is it.
  process.stdin.once("end", () => process.exit(0));
  process.stdin.once("close", () => process.exit(0));

  // Honor explicit termination signals sent by process managers or the kernel.
  // SIGTERM: sent by systemd, launchd, Docker, or `kill <pid>`.
  // SIGHUP:  sent when the controlling terminal closes (e.g. SSH disconnect).
  // SIGINT (Ctrl-C) is already handled by Node.js default behaviour.
  process.once("SIGTERM", () => process.exit(0));
  process.once("SIGHUP", () => process.exit(0));

  await server.connect(transport);
}
