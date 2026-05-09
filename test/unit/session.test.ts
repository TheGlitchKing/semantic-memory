import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { SessionManager, deriveSessionDir, deriveProjectRoot } from "../../src/core/session.js";

describe("SessionManager", () => {
  let dir: string;
  let mgr: SessionManager;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "session-mgr-"));
    mgr = new SessionManager(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("start", () => {
    it("creates a session and returns a stable id", async () => {
      const r = await mgr.start("test-task");
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("unreachable");
      expect(r.id).toMatch(/^ses_/);
      expect(existsSync(mgr.sessionPath)).toBe(true);
    });

    it("rejects empty task", async () => {
      const r = await mgr.start("");
      expect(r.ok).toBe(false);
    });

    it("returns existing id when called twice with same task (idempotent)", async () => {
      const a = await mgr.start("same-task");
      expect(a.ok).toBe(true);
      const b = await mgr.start("same-task");
      expect(b.ok).toBe(true);
      if (!a.ok || !b.ok) throw new Error("unreachable");
      expect(b.id).toBe(a.id);
      expect(b.reused).toBe(true);
    });

    it("refuses when a session is already open with a different task", async () => {
      await mgr.start("task-A");
      const r = await mgr.start("task-B");
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error("unreachable");
      expect(r.error).toMatch(/already open/);
    });
  });

  describe("status", () => {
    it("reports no_session when nothing started", async () => {
      const s = await mgr.status();
      expect(s.state).toBe("no_session");
    });

    it("reports active when session is fresh", async () => {
      await mgr.start("task");
      const s = await mgr.status();
      expect(s.state).toBe("active");
      if (s.state === "no_session") throw new Error("unreachable");
      expect(s.task).toBe("task");
      expect(s.verifications).toEqual([]);
    });

    it("reports stale when last_activity_at is >24h old", async () => {
      await mgr.start("task");
      // Directly mutate the state file to simulate age
      const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
      const r = await mgr.readActive();
      if (!r) throw new Error("session expected");
      r.last_activity_at = old;
      await writeFile(mgr.sessionPath, JSON.stringify(r), "utf-8");
      const s = await mgr.status();
      expect(s.state).toBe("stale");
    });
  });

  describe("run", () => {
    it("captures a successful command's exit code and tail", async () => {
      await mgr.start("task");
      const r = await mgr.run("echo hello");
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("unreachable");
      expect(r.record.exit).toBe(0);
      expect(r.record.tail).toContain("hello");
      const status = await mgr.status();
      if (status.state === "no_session") throw new Error("unreachable");
      expect(status.verifications).toHaveLength(1);
    });

    it("captures a non-zero exit", async () => {
      await mgr.start("task");
      const r = await mgr.run("exit 7");
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("unreachable");
      expect(r.record.exit).toBe(7);
    });

    it("refuses without an active session", async () => {
      const r = await mgr.run("echo nope");
      expect(r.ok).toBe(false);
    });

    it("refuses empty cmd", async () => {
      await mgr.start("task");
      const r = await mgr.run("");
      expect(r.ok).toBe(false);
    });

    it("times out a long-running command", async () => {
      await mgr.start("task");
      const r = await mgr.run("sleep 5", 200);
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("unreachable");
      // Either exit is null (killed) or signal indicates SIGTERM
      expect(r.record.exit === null || r.record.signal !== null).toBe(true);
    });
  });

  describe("finish (hard gate)", () => {
    it("refuses without verifications when verified is not waived", async () => {
      await mgr.start("task");
      const r = await mgr.finish({ summary: "done" });
      expect(r.ok).toBe(false);
      if (r.ok) throw new Error("unreachable");
      expect(r.error).toMatch(/no verification commands/);
      expect(existsSync(mgr.sessionPath)).toBe(true);
    });

    it("succeeds when at least one verification has been recorded", async () => {
      await mgr.start("task");
      await mgr.run("echo ok");
      const r = await mgr.finish({ summary: "done" });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("unreachable");
      expect(r.closed.closed_at).toBeDefined();
      expect(r.closed.closed_summary).toBe("done");
      expect(existsSync(mgr.sessionPath)).toBe(false);
    });

    it("succeeds with verified=false + reason (waiver path)", async () => {
      await mgr.start("docs-only");
      const r = await mgr.finish({ summary: "edited 3 docs", verified: false, reason: "doc-only edits, no test surface" });
      expect(r.ok).toBe(true);
      if (!r.ok) throw new Error("unreachable");
      expect(r.closed.closed_verified_waived).toBe(true);
      expect(r.closed.closed_waiver_reason).toBe("doc-only edits, no test surface");
      expect(existsSync(mgr.sessionPath)).toBe(false);
    });

    it("refuses verified=false without reason", async () => {
      await mgr.start("docs");
      const r = await mgr.finish({ summary: "x", verified: false });
      expect(r.ok).toBe(false);
      expect(existsSync(mgr.sessionPath)).toBe(true);
    });

    it("refuses verified=false with empty reason", async () => {
      await mgr.start("docs");
      const r = await mgr.finish({ summary: "x", verified: false, reason: "  " });
      expect(r.ok).toBe(false);
    });

    it("refuses empty summary", async () => {
      await mgr.start("task");
      await mgr.run("echo ok");
      const r = await mgr.finish({ summary: "" });
      expect(r.ok).toBe(false);
    });

    it("refuses without an active session", async () => {
      const r = await mgr.finish({ summary: "x", verified: false, reason: "y" });
      expect(r.ok).toBe(false);
    });
  });

  describe("recordNotesTouched", () => {
    it("appends and dedupes paths on the active session", async () => {
      await mgr.start("task");
      await mgr.recordNotesTouched(["a.md", "b.md"]);
      await mgr.recordNotesTouched(["b.md", "c.md"]);
      const s = await mgr.status();
      if (s.state === "no_session") throw new Error("unreachable");
      expect(s.notes_touched.sort()).toEqual(["a.md", "b.md", "c.md"]);
    });

    it("is a no-op without an active session", async () => {
      await mgr.recordNotesTouched(["a.md"]);
      const s = await mgr.status();
      expect(s.state).toBe("no_session");
    });
  });
});

describe("path derivation", () => {
  it("derives project root from .claude/.vault path", () => {
    expect(deriveProjectRoot("/foo/bar/.claude/.vault")).toBe("/foo/bar");
    expect(deriveProjectRoot("/foo/bar/.claude/.vault/")).toBe("/foo/bar");
  });

  it("treats arbitrary vault path as project root when not under .claude/.vault", () => {
    expect(deriveProjectRoot("/some/other/path")).toBe("/some/other/path");
  });

  it("session dir lands under <project>/.claude/.semantic-memory/", () => {
    expect(deriveSessionDir("/foo/bar/.claude/.vault")).toBe("/foo/bar/.claude/.semantic-memory");
    expect(deriveSessionDir("/foo/bar")).toBe("/foo/bar/.claude/.semantic-memory");
  });
});
