import { existsSync, mkdirSync, statSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";

/**
 * State files that moved/renamed in v1.2.
 *
 * Each entry: legacy path (relative to <projectRoot>/.claude) → new path (relative to
 * <projectRoot>/.claude). Reads in v1.x check new first, fall back to old; writes always
 * go to new. This command does the explicit move so the legacy files stop existing.
 *
 * Order matters only for human-readable output; the migrations themselves are independent.
 */
const STATE_MIGRATIONS: { name: string; old: string; new: string }[] = [
  { name: "mode", old: ".sidekick-mode", new: ".semantic-memory/mode" },
  { name: "fingerprints", old: ".sidekick-fingerprints.json", new: ".semantic-memory/fingerprints.json" },
  { name: "capture-pending", old: ".sidekick-capture-pending.json", new: ".semantic-memory/capture-pending.json" },
];

export type MigrationStatus = "migrated" | "skipped-no-source" | "skipped-already-migrated" | "conflict" | "resolved-by-force";

export interface MigrationFinding {
  name: string;
  status: MigrationStatus;
  oldPath: string;
  newPath: string;
  detail?: string;
}

export interface MigrateStateOptions {
  projectRoot: string;
  dryRun?: boolean;
  force?: boolean;
}

export interface MigrateStateResult {
  migrated: MigrationFinding[];
  skipped: MigrationFinding[];
  conflicts: MigrationFinding[];
}

/**
 * Move legacy `.claude/.sidekick-*` state files to the canonical
 * `.claude/.semantic-memory/<name>` paths.
 *
 * Behavior per file:
 *  - old exists, new does not       → MIGRATE: rename old to new
 *  - old does not exist             → SKIP (skipped-no-source)
 *  - old does not exist, new exists → SKIP (skipped-already-migrated)
 *  - both old and new exist         → CONFLICT (refused without --force)
 *                                     With --force: prefer new, delete old
 *
 * Idempotent: a second run after a successful migration is all-no-ops.
 */
export function migrateState(opts: MigrateStateOptions): MigrateStateResult {
  const result: MigrateStateResult = {
    migrated: [],
    skipped: [],
    conflicts: [],
  };

  const stateDir = join(opts.projectRoot, ".claude", ".semantic-memory");
  if (!opts.dryRun && !existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }

  for (const m of STATE_MIGRATIONS) {
    const oldPath = join(opts.projectRoot, ".claude", m.old);
    const newPath = join(opts.projectRoot, ".claude", m.new);
    const oldExists = existsSync(oldPath);
    const newExists = existsSync(newPath);

    if (!oldExists && !newExists) {
      result.skipped.push({ name: m.name, status: "skipped-no-source", oldPath, newPath, detail: "neither path exists" });
      continue;
    }
    if (!oldExists && newExists) {
      result.skipped.push({ name: m.name, status: "skipped-already-migrated", oldPath, newPath, detail: "already at new path" });
      continue;
    }
    if (oldExists && newExists) {
      if (!opts.force) {
        const oldMtime = safeMtime(oldPath);
        const newMtime = safeMtime(newPath);
        result.conflicts.push({
          name: m.name,
          status: "conflict",
          oldPath,
          newPath,
          detail: `both paths exist (old: ${oldMtime}, new: ${newMtime}); pass --force to keep new and delete old`,
        });
        continue;
      }
      // --force: prefer new, delete old
      if (!opts.dryRun) {
        try { unlinkSync(oldPath); } catch (e: any) {
          result.conflicts.push({ name: m.name, status: "conflict", oldPath, newPath, detail: `force-delete of old failed: ${e?.message ?? e}` });
          continue;
        }
      }
      result.migrated.push({
        name: m.name,
        status: "resolved-by-force",
        oldPath,
        newPath,
        detail: opts.dryRun ? "dry-run: would delete old" : "old deleted; new preserved",
      });
      continue;
    }
    // oldExists && !newExists → migrate
    if (!opts.dryRun) {
      try { renameSync(oldPath, newPath); } catch (e: any) {
        // Cross-device rename failure is theoretically possible; for state files all
        // under .claude/, both paths are the same filesystem in practice.
        result.conflicts.push({ name: m.name, status: "conflict", oldPath, newPath, detail: `rename failed: ${e?.message ?? e}` });
        continue;
      }
    }
    result.migrated.push({
      name: m.name,
      status: "migrated",
      oldPath,
      newPath,
      detail: opts.dryRun ? "dry-run: would rename old to new" : "renamed",
    });
  }

  return result;
}

function safeMtime(path: string): string {
  try {
    return statSync(path).mtime.toISOString();
  } catch {
    return "unknown";
  }
}
