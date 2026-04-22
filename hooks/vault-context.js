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

function capturePendingPath(projectRoot) {
  const dir = join(projectRoot, ".claude");
  try { mkdirSync(dir, { recursive: true }); } catch {}
  return join(dir, ".sidekick-capture-pending.json");
}

const VALID_MODES = new Set(["vault-first", "research", "outage-silence"]);

function modePath(projectRoot) {
  return join(projectRoot, ".claude", ".sidekick-mode");
}

function readMode(projectRoot) {
  try {
    const m = readFileSync(modePath(projectRoot), "utf8").trim();
    if (VALID_MODES.has(m)) return m;
  } catch {}
  return "vault-first";
}

function writeMode(projectRoot, mode) {
  if (!VALID_MODES.has(mode)) return;
  try {
    const dir = join(projectRoot, ".claude");
    mkdirSync(dir, { recursive: true });
    writeFileSync(modePath(projectRoot), mode);
  } catch (e) {
    debug(`mode write failed: ${e.message}`);
  }
}

// Keywords that suggest the user is relaying new knowledge worth capturing as a note.
const CAPTURE_CUES = [
  /\bbecause\b/i,
  /\bdecided\b|\bwe chose\b|\bthe decision\b/i,
  /\bturned out to be\b|\bthe bug was\b|\bthe fix was\b/i,
  /\bgotcha\b|\bworkaround\b|\bhack\b/i,
  /\bnew convention\b|\bfrom now on\b|\bgoing forward\b/i,
];

function detectCaptureCue(prompt) {
  for (const re of CAPTURE_CUES) {
    if (re.test(prompt)) return re.source;
  }
  return null;
}

function addCapturePending(projectRoot, prompt, cueSource) {
  try {
    const p = capturePendingPath(projectRoot);
    let state = { items: [] };
    try { state = JSON.parse(readFileSync(p, "utf8")); } catch {}
    if (!Array.isArray(state.items)) state.items = [];
    state.items.push({
      ts: new Date().toISOString(),
      cue: cueSource,
      excerpt: prompt.slice(0, 200),
    });
    writeFileSync(p, JSON.stringify(state));
  } catch (e) {
    debug(`capture pending write failed: ${e.message}`);
  }
}

function resetCapturePending(projectRoot) {
  try {
    const p = capturePendingPath(projectRoot);
    writeFileSync(p, JSON.stringify({ items: [] }));
  } catch {}
}

function readCapturePending(projectRoot) {
  try {
    const p = capturePendingPath(projectRoot);
    const state = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(state.items) ? state.items : [];
  } catch {
    return [];
  }
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
  resetCapturePending(projectRoot);
  // SessionStart resets mode to default — Phase 4 contract.
  writeMode(projectRoot, "vault-first");
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

function emitStop(additionalContext, block) {
  const out = { hookSpecificOutput: { hookEventName: "Stop" } };
  if (additionalContext && additionalContext.trim()) {
    out.hookSpecificOutput.additionalContext = additionalContext;
  }
  if (block) {
    out.decision = "block";
    out.reason = additionalContext || "capture pending";
  }
  process.stdout.write(JSON.stringify(out) + "\n");
}

async function handleStop(projectRoot) {
  const stopHookActive = process.env.CLAUDE_STOP_HOOK_ACTIVE === "1";
  if (stopHookActive) {
    // Already blocking — Claude is mid-response to our nudge. Clear and yield.
    resetCapturePending(projectRoot);
    emitStop("", false);
    return;
  }

  const pending = readCapturePending(projectRoot);
  const mode = readMode(projectRoot);

  // Mode-specific transition-capture. research-mode and outage-silence each
  // demand a structured synthesis on session end; vault-first reuses the
  // Phase 2 generic capture prompt.
  if (mode === "research" && pending.length > 0) {
    const lines = [
      `<vault-transition-capture mode="research" count="${pending.length}">`,
      `Research session ending. ${pending.length} potential finding${pending.length === 1 ? "" : "s"} accumulated:`,
      "",
    ];
    for (const item of pending.slice(0, 8)) {
      lines.push(`- "${item.excerpt.replace(/\n/g, " ")}"`);
    }
    lines.push("");
    lines.push(`Mandatory before Stop: call \`mcp__semantic-vault__synthesize_note\` with dry_run=true to preview a research-synthesis note (derived_from the session's filed sources). Review with the user, then apply. A research session that ends without synthesis is lost work.`);
    lines.push(`</vault-transition-capture>`);
    resetCapturePending(projectRoot);
    emitStop(lines.join("\n"), true);
    return;
  }

  if (mode === "outage-silence") {
    const lines = [
      `<vault-transition-capture mode="outage-silence">`,
      `Outage session ending. Before closing: draft a postmortem via \`mcp__semantic-vault__synthesize_note\` with \`type: gotcha\` (or \`decision\` if architectural). Include timeline, root cause, fix, preventive actions. Dry-run first, confirm with the user, then apply.`,
      `</vault-transition-capture>`,
    ];
    resetCapturePending(projectRoot);
    emitStop(lines.join("\n"), true);
    return;
  }

  // vault-first default: existing capture-pending behavior.
  if (pending.length === 0) {
    emitStop("", false);
    return;
  }
  const lines = [
    `<vault-capture-prompt count="${pending.length}">`,
    `This session surfaced ${pending.length} capture-worthy moment${pending.length === 1 ? "" : "s"} (user prompts contained decision/gotcha/fix cues):`,
    "",
  ];
  for (const item of pending.slice(0, 5)) {
    lines.push(`- cue \`${item.cue}\`: "${item.excerpt.replace(/\n/g, " ")}"`);
  }
  lines.push("");
  lines.push(`Before ending: for each still-unsynthesized item above, either call \`mcp__semantic-vault__synthesize_note\` to file it with provenance, or explicitly acknowledge that it was already captured / not worth capturing.`);
  lines.push(`</vault-capture-prompt>`);
  resetCapturePending(projectRoot);
  emitStop(lines.join("\n"), true);
}

async function handlePrompt(projectRoot, vaultPath, cliBin, input) {
  const prompt = typeof input.prompt === "string" ? input.prompt : "";
  if (!prompt || prompt.length < 8) {
    emit("UserPromptSubmit", "");
    return;
  }
  // Outage-silence suppresses auto-vault activity. Skill describes the contract;
  // hook enforces it at the injection layer so even a misrouted turn stays quiet.
  const mode = readMode(projectRoot);
  if (mode === "outage-silence") {
    debug("outage-silence mode — suppressing auto-vault context");
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
  const hits = runSearchCli(cliBin, ["--notes", vaultPath, "--limit", "8", prompt], 30_000);
  state.recent = [fp, ...recent].slice(0, 10);
  saveFingerprints(fpPath, state);
  const cue = detectCaptureCue(prompt);
  if (cue) {
    addCapturePending(projectRoot, prompt, cue);
  }
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
    } else if (eventName === "Stop") {
      await handleStop(projectRoot);
    } else {
      await handleSessionStart(projectRoot, vaultPath, cliBin);
    }
  } catch (e) {
    debug(`handler failed: ${e.message}`);
    emit(eventName, "");
  }
}

main();
