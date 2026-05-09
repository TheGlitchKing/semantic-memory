import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";
import { logEvent } from "../../core/log.js";

export function registerSessionTools(server: McpServer, ctx: ServerContext): void {
  if (ctx.options.readOnly) return;

  server.tool(
    "session_start",
    "Open a verification-gated session for a multi-step task. State persists at .claude/.semantic-memory/session.json. Refuses if a session is already open with a different task. Calling with the same task as an open session returns the existing id (idempotent).",
    {
      task: z.string().describe("Short description of the task being worked on. Recorded in session state and surfaced at session_finish."),
    },
    async ({ task }) => {
      const result = await ctx.sessions.start(task);
      if (result.ok) {
        await logEvent(ctx.notesPath, {
          kind: "session",
          summary: result.reused ? `resumed session ${result.id}` : `started session ${result.id}`,
          payload: { tool: "session_start", id: result.id, task, reused: !!result.reused },
        }).catch(() => {});
      }
      return ctx.textResponse(JSON.stringify(result, null, 2));
    }
  );

  server.tool(
    "session_run",
    "Run a verification command inside the active session. Captures exit code, signal, duration, and a tail of stdout+stderr. Refused when no session is open. Default timeout: 5 minutes.",
    {
      cmd: z.string().describe("Shell command to run, e.g. 'npm test' or 'go test ./...'."),
      timeout_ms: z.coerce.number().int().positive().optional().describe("Override the default 5-minute timeout (in milliseconds)."),
    },
    async ({ cmd, timeout_ms }) => {
      const result = await ctx.sessions.run(cmd, timeout_ms);
      if (result.ok) {
        await logEvent(ctx.notesPath, {
          kind: "session",
          summary: `ran ${cmd} → exit=${result.record.exit ?? "(killed)"}`,
          payload: {
            tool: "session_run",
            cmd,
            exit: result.record.exit,
            signal: result.record.signal,
            duration_ms: result.record.duration_ms,
          },
        }).catch(() => {});
      }
      return ctx.textResponse(JSON.stringify(result, null, 2));
    }
  );

  server.tool(
    "session_finish",
    "Close the active session. HARD GATED: refused without recorded verifications unless verified=false is passed with a `reason` waiving verification (e.g. for prose-only edits). Deletes session state on success.",
    {
      summary: z.string().describe("One-line description of what was accomplished. Appears in the closeout log entry."),
      verified: z.boolean().optional().default(true).describe("Pass false to explicitly waive verification (requires `reason`)."),
      reason: z.string().optional().describe("Required when verified=false. Why verification is not applicable to this task."),
    },
    async ({ summary, verified, reason }) => {
      const result = await ctx.sessions.finish({ summary, verified, reason });
      if (result.ok) {
        await logEvent(ctx.notesPath, {
          kind: "session",
          summary: `finished session ${result.closed.id}: ${summary}`,
          payload: {
            tool: "session_finish",
            id: result.closed.id,
            task: result.closed.task,
            verifications: result.closed.verifications.length,
            verified_waived: !!result.closed.closed_verified_waived,
            ...(result.closed.closed_verified_waived && { waiver_reason: result.closed.closed_waiver_reason }),
          },
        }).catch(() => {});
      }
      return ctx.textResponse(JSON.stringify(result, null, 2));
    }
  );

  server.tool(
    "session_status",
    "Read-only inspection of the active session — task, verifications, notes_touched, and a state label (active | stale | no_session). 'stale' indicates last_activity_at >24h ago.",
    {},
    async () => {
      const result = await ctx.sessions.status();
      return ctx.textResponse(JSON.stringify(result, null, 2));
    }
  );
}
