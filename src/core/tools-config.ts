import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { deriveProjectRoot } from "./session.js";

/**
 * Token-frugal tool surface (v1.4 Phase 7).
 *
 * When `tools.conditional` is enabled in vault.schema.yml, the server registers a
 * reduced tool set in modes that don't need the whole surface (outage-silence
 * wants search/read only, not the full ~42). Ships DEFAULT OFF (KQ9): mid-session
 * mode switches don't re-register, so this must be opted into and dogfooded before
 * it can default on. Default (disabled) → the full surface, unchanged.
 */
export interface ToolsConfig {
  conditional: boolean;
}

export function loadToolsConfig(vaultPath: string): ToolsConfig {
  try {
    const schemaPath = join(vaultPath, "vault.schema.yml");
    if (!existsSync(schemaPath)) return { conditional: false };
    const parsed = parseYaml(readFileSync(schemaPath, "utf-8")) as { tools?: { conditional?: boolean } } | null;
    return { conditional: parsed?.tools?.conditional === true };
  } catch {
    return { conditional: false };
  }
}

/** Read the active mode from the state file (new path, then legacy). Default vault-first. */
export function readActiveMode(vaultPath: string): string {
  const root = deriveProjectRoot(vaultPath);
  const candidates = [
    join(root, ".claude", ".semantic-memory", "mode"),
    join(root, ".claude", ".sidekick-mode"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) {
        const v = readFileSync(p, "utf-8").trim();
        if (v) return v;
      }
    } catch {
      /* fall through */
    }
  }
  return "vault-first";
}

/**
 * Decide whether to register only the minimal read/search surface. True only when
 * conditional registration is enabled AND the active mode is outage-silence.
 */
export function useMinimalToolSurface(vaultPath: string): boolean {
  const cfg = loadToolsConfig(vaultPath);
  if (!cfg.conditional) return false;
  return readActiveMode(vaultPath) === "outage-silence";
}
