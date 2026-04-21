#!/usr/bin/env node
// vault-context.js — Phase 1 activation hook for semantic-sidekick.
//
// Dual-mode hook:
//   SessionStart      → hybrid search seeded from cwd/branch, injected once at session boot
//   UserPromptSubmit  → text search seeded from prompt, fingerprinted to suppress re-firing
//
// Output contract (Claude Code hook protocol):
//   { "hookSpecificOutput": { "hookEventName": "<event>", "additionalContext": "<text>" } }
//
// Fails open: any error logs to stderr and emits an empty additionalContext.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { createHash } from "node:crypto";

const DEBUG = process.env.SIDEKICK_DEBUG === "1";
function debug(msg) {
  if (DEBUG) process.stderr.write(`[vault-context] ${msg}\n`);
}

function readStdinJson() {
  try {
    const raw = readFileSync(0, "utf8");
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    debug(`stdin parse failed: ${e.message}`);
    return {};
  }
}

function emit(eventName, additionalContext) {
  const out = { hookSpecificOutput: { hookEventName: eventName } };
  if (additionalContext && additionalContext.trim()) {
    out.hookSpecificOutput.additionalContext = additionalContext;
  }
  process.stdout.write(JSON.stringify(out) + "\n");
}

function findVaultPath(projectRoot) {
  // 1. Explicit env override (useful for tests)
  if (process.env.SIDEKICK_VAULT_PATH) {
    const p = resolve(process.env.SIDEKICK_VAULT_PATH);
    return existsSync(p) ? p : null;
  }
  // 2. Read .mcp.json → mcpServers.semantic-vault.args[--notes ...]
  const mcpPath = join(projectRoot, ".mcp.json");
  if (existsSync(mcpPath)) {
    try {
      const data = JSON.parse(readFileSync(mcpPath, "utf8"));
      const entries = data?.mcpServers || {};
      for (const [name, entry] of Object.entries(entries)) {
        if (!entry || typeof entry !== "object") continue;
        if (name !== "semantic-vault" && name !== "semantic-sidekick") continue;
        const args = Array.isArray(entry.args) ? entry.args : [];
        const i = args.indexOf("--notes");
        if (i >= 0 && i + 1 < args.length) {
          const p = resolve(projectRoot, args[i + 1]);
          if (existsSync(p)) return p;
        }
      }
    } catch (e) {
      debug(`.mcp.json parse failed: ${e.message}`);
    }
  }
  // 3. Default
  const def = join(projectRoot, ".claude", ".vault");
  return existsSync(def) ? def : null;
}

function findCliBin(projectRoot) {
  // Prefer local installed bin (when sidekick is a dependency)
  const installed = join(projectRoot, "node_modules", "@theglitchking", "semantic-sidekick", "bin", "semantic-sidekick");
  if (existsSync(installed)) return installed;
  // Dev fallback: this hook lives in <repo>/hooks/, the built CLI is at <repo>/dist/cli/index.js
  const dev = resolve(new URL("../dist/cli/index.js", import.meta.url).pathname);
  if (existsSync(dev)) return dev;
  return null;
}

function runSearchCli(cliBin, args, timeoutMs) {
  const r = spawnSync("node", [cliBin, "search", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });
  if (r.status !== 0) {
    debug(`search exited ${r.status}: ${r.stderr?.toString().trim()}`);
    return null;
  }
  try {
    return JSON.parse(r.stdout.toString());
  } catch (e) {
    debug(`search output parse failed: ${e.message}`);
    return null;
  }
}

function formatContextBlock(source, query, hits) {
  if (!hits || hits.length === 0) return "";
  const lines = [];
  lines.push(`<vault-context source="${source}" query="${escapeAttr(query)}">`);
  lines.push(`The vault (semantic-sidekick) was proactively searched. Top hits:`);
  lines.push("");
  for (const h of hits.slice(0, 6)) {
    const score = typeof h.score === "number" ? h.score.toFixed(2) : "";
    lines.push(`- \`${h.path}\`${score ? ` (score: ${score})` : ""}`);
    if (h.snippet) {
      const snip = h.snippet.replace(/\s+/g, " ").slice(0, 240);
      lines.push(`  > ${snip}`);
    }
  }
  lines.push("");
  lines.push(`Instructions: Read the top hits via \`mcp__semantic-vault__read_note\` before answering, then cite filenames in your response. If none of these actually answer the question, say "not in vault" and name the nearest misses.`);
  lines.push(`</vault-context>`);
  return lines.join("\n");
}

function escapeAttr(s) {
  return String(s).replace(/["<>&]/g, (c) => ({ '"': "&quot;", "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
}

function sessionSeedQuery(projectRoot) {
  const parts = [];
  parts.push(basename(projectRoot));
  try {
    const r = spawnSync("git", ["-C", projectRoot, "rev-parse", "--abbrev-ref", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    });
    if (r.status === 0) {
      const branch = r.stdout.toString().trim();
      if (branch && branch !== "HEAD") parts.push(branch.replace(/[-_/]/g, " "));
    }
  } catch {}
  return parts.join(" ");
}

function fingerprintPath(projectRoot) {
  const dir = join(projectRoot, ".claude");
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return join(dir, ".sidekick-fingerprints.json");
}

function normalizeFingerprint(prompt) {
  return createHash("sha1")
    .update(prompt.toLowerCase().replace(/\s+/g, " ").trim())
    .digest("hex")
    .slice(0, 16);
}

function loadFingerprints(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return { recent: [] };
  }
}

function saveFingerprints(path, state) {
  try {
    writeFileSync(path, JSON.stringify(state));
  } catch (e) {
    debug(`fingerprint save failed: ${e.message}`);
  }
}

async function handleSessionStart(projectRoot, vaultPath, cliBin) {
  const query = sessionSeedQuery(projectRoot);
  debug(`sessionstart seed query: "${query}"`);
  const hits = runSearchCli(cliBin, ["--notes", vaultPath, "--limit", "6", query], 30_000);
  if (!hits || hits.length === 0) {
    emit("SessionStart", "");
    return;
  }
  const block = formatContextBlock("sessionstart", query, hits);
  emit("SessionStart", block);
}

async function handlePrompt(projectRoot, vaultPath, cliBin, input) {
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  if (!prompt || prompt.length < 8) {
    emit("UserPromptSubmit", "");
    return;
  }
  const fpPath = fingerprintPath(projectRoot);
  const state = loadFingerprints(fpPath);
  const fp = normalizeFingerprint(prompt);
  const recent = Array.isArray(state.recent) ? state.recent : [];
  if (recent.includes(fp)) {
    debug(`fingerprint ${fp} recently fired — suppressing`);
    emit("UserPromptSubmit", "");
    return;
  }
  const hits = runSearchCli(cliBin, ["--notes", vaultPath, "--limit", "5", prompt], 30_000);
  state.recent = [fp, ...recent].slice(0, 10);
  saveFingerprints(fpPath, state);
  if (!hits || hits.length === 0) {
    emit("UserPromptSubmit", "");
    return;
  }
  const block = formatContextBlock("prompt", prompt.slice(0, 120), hits);
  emit("UserPromptSubmit", block);
}

async function main() {
  const input = readStdinJson();
  const eventName = input.hook_event_name || process.env.CLAUDE_HOOK_EVENT || "SessionStart";
  const projectRoot = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  debug(`event=${eventName} projectRoot=${projectRoot}`);

  const vaultPath = findVaultPath(projectRoot);
  if (!vaultPath) {
    debug(`no vault found under ${projectRoot}`);
    emit(eventName, "");
    return;
  }
  const cliBin = findCliBin(projectRoot);
  if (!cliBin) {
    debug(`no CLI bin found`);
    emit(eventName, "");
    return;
  }
  debug(`vault=${vaultPath} bin=${cliBin}`);

  try {
    if (eventName === "UserPromptSubmit") {
      await handlePrompt(projectRoot, vaultPath, cliBin, input);
    } else {
      await handleSessionStart(projectRoot, vaultPath, cliBin);
    }
  } catch (e) {
    debug(`handler failed: ${e.message}`);
    emit(eventName, "");
  }
}

main();
