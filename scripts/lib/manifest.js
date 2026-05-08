#!/usr/bin/env node
/**
 * Manifest helper — generate, verify, and diff a sha256 inventory of a
 * directory tree. Used by build-offline-tarball.sh and install-offline.sh
 * to detect transport corruption and destination drift.
 *
 * Subcommands:
 *   manifest.js generate <root_dir> <out_manifest_path> [--meta key=value ...]
 *   manifest.js verify <root_dir> <manifest_path>
 *   manifest.js diff <root_dir> <manifest_path>
 *   manifest.js read <manifest_path> <field>
 *
 * Manifest schema:
 *   {
 *     "schema": 1,
 *     "version": "0.2.5",
 *     "gitSha": "abc1234567",
 *     "buildTime": "2026-05-07T12:34:56Z",
 *     "builder": "user@host",
 *     "arch": "x64",
 *     "meta": { ...arbitrary key=value pairs from --meta... },
 *     "files": [{ "path": "rel/path", "sha256": "...", "size": 1234 }, ...]
 *   }
 *
 * Files are listed sorted by path; the manifest itself is excluded from the
 * inventory (chicken-and-egg avoidance).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";

const MANIFEST_BASENAME = "MANIFEST.json";

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

function walkFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = fs.readlinkSync(full);
        out.push({
          path: path.relative(root, full),
          kind: "symlink",
          target,
        });
        continue;
      }
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile()) {
        const stat = fs.statSync(full);
        out.push({
          path: path.relative(root, full),
          kind: "file",
          sha256: sha256File(full),
          size: stat.size,
        });
      }
    }
  }
  return out
    .filter((f) => f.path !== MANIFEST_BASENAME)
    .sort((a, b) => a.path.localeCompare(b.path));
}

function parseMeta(args) {
  const meta = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--meta" && args[i + 1]) {
      const [k, ...rest] = args[i + 1].split("=");
      meta[k] = rest.join("=");
      i++;
    }
  }
  return meta;
}

function cmdGenerate(rootDir, outPath, extraArgs) {
  const meta = parseMeta(extraArgs);
  const files = walkFiles(rootDir);

  const manifest = {
    schema: 1,
    version: meta.version ?? null,
    gitSha: meta.gitSha ?? null,
    buildTime: new Date().toISOString(),
    builder: `${process.env.USER ?? "unknown"}@${os.hostname()}`,
    arch: meta.arch ?? "x64",
    meta,
    files,
  };

  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest: wrote ${files.length} entries to ${outPath}`);
}

function cmdVerify(rootDir, manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const drift = computeDrift(rootDir, manifest);
  if (drift.missing.length === 0 && drift.modified.length === 0 && drift.extra.length === 0) {
    console.log(`verify: OK (${manifest.files.length} files match)`);
    process.exit(0);
  }
  reportDrift(drift);
  process.exit(1);
}

function cmdDiff(rootDir, manifestPath) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const drift = computeDrift(rootDir, manifest);
  reportDrift(drift);
  process.exit(0);
}

function cmdRead(manifestPath, field) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  const value = field.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), manifest);
  if (value === undefined || value === null) {
    process.exit(1);
  }
  console.log(typeof value === "string" ? value : JSON.stringify(value));
}

function computeDrift(rootDir, manifest) {
  const expected = new Map(manifest.files.map((f) => [f.path, f]));
  const actual = walkFiles(rootDir);
  const actualMap = new Map(actual.map((f) => [f.path, f]));

  const missing = [];
  const modified = [];
  const extra = [];

  for (const [p, exp] of expected) {
    const act = actualMap.get(p);
    if (!act) {
      missing.push(p);
      continue;
    }
    if (exp.kind !== act.kind) {
      modified.push({ path: p, reason: `kind ${exp.kind} -> ${act.kind}` });
      continue;
    }
    if (exp.kind === "file" && exp.sha256 !== act.sha256) {
      modified.push({ path: p, reason: `sha256 mismatch` });
      continue;
    }
    if (exp.kind === "symlink" && exp.target !== act.target) {
      modified.push({ path: p, reason: `symlink target ${exp.target} -> ${act.target}` });
      continue;
    }
  }

  for (const [p] of actualMap) {
    if (!expected.has(p)) extra.push(p);
  }

  return { missing, modified, extra };
}

function reportDrift({ missing, modified, extra }) {
  if (missing.length) {
    console.error(`MISSING (${missing.length}):`);
    missing.forEach((p) => console.error(`  - ${p}`));
  }
  if (modified.length) {
    console.error(`MODIFIED (${modified.length}):`);
    modified.forEach((m) => console.error(`  ~ ${m.path}  (${m.reason})`));
  }
  if (extra.length) {
    console.error(`EXTRA (${extra.length}):`);
    extra.forEach((p) => console.error(`  + ${p}`));
  }
}

function main() {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "generate": {
      const [rootDir, outPath, ...extra] = rest;
      if (!rootDir || !outPath) {
        console.error("usage: manifest.js generate <root_dir> <out_manifest_path> [--meta k=v ...]");
        process.exit(2);
      }
      cmdGenerate(rootDir, outPath, extra);
      break;
    }
    case "verify": {
      const [rootDir, manifestPath] = rest;
      if (!rootDir || !manifestPath) {
        console.error("usage: manifest.js verify <root_dir> <manifest_path>");
        process.exit(2);
      }
      cmdVerify(rootDir, manifestPath);
      break;
    }
    case "diff": {
      const [rootDir, manifestPath] = rest;
      if (!rootDir || !manifestPath) {
        console.error("usage: manifest.js diff <root_dir> <manifest_path>");
        process.exit(2);
      }
      cmdDiff(rootDir, manifestPath);
      break;
    }
    case "read": {
      const [manifestPath, field] = rest;
      if (!manifestPath || !field) {
        console.error("usage: manifest.js read <manifest_path> <field>");
        process.exit(2);
      }
      cmdRead(manifestPath, field);
      break;
    }
    default:
      console.error("usage: manifest.js {generate|verify|diff|read} ...");
      process.exit(2);
  }
}

main();
