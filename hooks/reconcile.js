// Plugin-specific SessionStart reconciliation for semantic-sidekick.
//
// Responsibilities (all conservative — the user's config always wins):
//   1. Ensure <project>/.claude/.vault exists.
//   2. If .mcp.json is missing a "semantic-vault" entry AND the package is
//      installed locally, add one in the node-against-node_modules form.
//      Existing entries (any shape) are preserved — if you want to rewrite
//      a stale entry, run `npx --no @theglitchking/semantic-sidekick
//      normalize-config`.
//   3. If hit-em-with-the-docs is enabled AND ./.documentation exists,
//      conditionally add a read-only "semantic-sidekick" entry pointed at
//      ./.documentation (same preserve-existing rule). Remove it ONLY if
//      the existing entry matches a shape we recognize as ours.
//
// Any write is preceded by a backup to .mcp.json.bak. Never writes the
// `npx @latest` form — that shape is fragile (npx cache corruption causes
// ERR_MODULE_NOT_FOUND) and was the root cause of the 0.10.0 bugfix.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";

const PKG = "@theglitchking/semantic-sidekick";
const VAULT_KEY = "semantic-vault";
const DOCS_KEY = "semantic-sidekick";

function readJson(path, fallback = null) {
  try {
    const raw = readFileSync(path, "utf8");
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function hewtdEnabled(projectRoot) {
  // Check user-level AND project-level settings. Plugin enablement is per-scope,
  // and hewtd might be enabled at either. Project-scope was previously ignored,
  // which caused the docs MCP to get silently removed by the reconcile pass on
  // every SessionStart for users who'd enabled hewtd only per-project.
  const candidates = [
    join(homedir(), ".claude", "settings.json"),
    join(projectRoot, ".claude", "settings.json"),
    join(projectRoot, ".claude", "settings.local.json"),
  ];
  for (const path of candidates) {
    const settings = readJson(path);
    const enabled = settings?.enabledPlugins || {};
    for (const key of Object.keys(enabled)) {
      if (key.startsWith("hit-em-with-the-docs@") && enabled[key] === true) {
        return true;
      }
    }
  }
  return false;
}

/** Absolute path to the locally-installed bin script, or null. */
export function findLocalBin(projectRoot) {
  const p = join(projectRoot, "node_modules", "@theglitchking", "semantic-sidekick", "bin", "semantic-sidekick");
  return existsSync(p) ? p : null;
}

/** Returns the arg form that goes into .mcp.json for this project. */
function binArg(projectRoot) {
  const abs = findLocalBin(projectRoot);
  if (!abs) return null;
  const rel = relative(projectRoot, abs);
  // Always use ./-prefixed relative form so it's machine-portable within the repo.
  return rel.startsWith("..") ? abs : `./${rel}`;
}

function buildEntry(binArgStr, notesPath, extraArgs = []) {
  return {
    type: "stdio",
    command: "node",
    args: [binArgStr, "--notes", notesPath, ...extraArgs],
  };
}

/**
 * Detect an entry as "one of ours" so we can safely remove it when the
 * condition that created it no longer holds. Matches both shapes we've ever
 * written: the legacy npx-form and the new node-against-node_modules form.
 */
function isOurEntry(entry, notesPath) {
  if (!entry || typeof entry !== "object") return false;
  const cmd = entry.command;
  const args = Array.isArray(entry.args) ? entry.args : [];
  const argStr = args.map((a) => String(a)).join(" ");

  // Legacy npx form we shipped in 0.8.0 and prior SessionStart hooks.
  if (cmd === "npx" && argStr.includes(PKG) && argStr.includes(notesPath)) return true;
  // Current node-against-node_modules form (0.10.0+).
  if (
    cmd === "node" &&
    args.some((a) => typeof a === "string" && a.includes("node_modules/@theglitchking/semantic-sidekick")) &&
    argStr.includes(notesPath)
  ) {
    return true;
  }
  return false;
}

function backup(mcpPath) {
  try {
    if (existsSync(mcpPath)) {
      writeFileSync(join(dirname(mcpPath), ".mcp.json.bak"), readFileSync(mcpPath, "utf8"));
    }
  } catch {}
}

export function reconcile(projectRoot) {
  const vaultDir = join(projectRoot, ".claude", ".vault");
  const docsDir = join(projectRoot, ".documentation");
  const mcpPath = join(projectRoot, ".mcp.json");

  try { mkdirSync(vaultDir, { recursive: true }); } catch {}

  const docsWired = hewtdEnabled(projectRoot) && existsSync(docsDir);

  let data = { mcpServers: {} };
  if (existsSync(mcpPath)) {
    const parsed = readJson(mcpPath, null);
    if (parsed === null) {
      let raw = "";
      try { raw = readFileSync(mcpPath, "utf8"); } catch {}
      if (raw.trim()) {
        process.stderr.write(`semantic-sidekick hook: could not parse ${mcpPath}; leaving untouched\n`);
        return;
      }
    } else if (parsed && typeof parsed === "object") {
      data = parsed;
      if (!data.mcpServers || typeof data.mcpServers !== "object") {
        data.mcpServers = {};
      }
    }
  }

  const before = JSON.stringify(data);

  const bin = binArg(projectRoot);

  // VAULT entry: create if missing AND we have a local install. Never
  // overwrite an existing entry (even if it looks "wrong" — the user
  // controls their .mcp.json).
  if (!data.mcpServers[VAULT_KEY]) {
    if (bin) {
      data.mcpServers[VAULT_KEY] = buildEntry(bin, "./.claude/.vault");
    }
  }

  // DOCS entry: same preserve-existing rule. Conditional on hewtd +
  // .documentation. When removing, only remove shapes we recognize as ours.
  if (docsWired) {
    if (!data.mcpServers[DOCS_KEY]) {
      if (bin) {
        data.mcpServers[DOCS_KEY] = buildEntry(bin, "./.documentation", ["--read-only"]);
      }
    }
  } else if (data.mcpServers[DOCS_KEY] && isOurEntry(data.mcpServers[DOCS_KEY], ".documentation")) {
    delete data.mcpServers[DOCS_KEY];
  }

  const after = JSON.stringify(data);
  if (after === before) return;

  backup(mcpPath);
  mkdirSync(dirname(mcpPath), { recursive: true });
  writeFileSync(mcpPath, JSON.stringify(data, null, 2) + "\n");
}
