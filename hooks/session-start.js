#!/usr/bin/env node
// semantic-sidekick SessionStart hook. Delegates lifecycle + update-check to
// @theglitchking/claude-plugin-runtime; plugin-specific .mcp.json wiring
// lives in ./reconcile.js.

import { runSessionStart } from "@theglitchking/claude-plugin-runtime";
import { reconcile } from "./reconcile.js";

await runSessionStart({
  packageName: "@theglitchking/semantic-sidekick",
  pluginName: "semantic-sidekick",
  configFile: "semantic-sidekick.json",
  reconcile,
});
