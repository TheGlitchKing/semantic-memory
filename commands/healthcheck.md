---
description: Verify the local semantic-sidekick install starts cleanly; self-heals npx-cache ERR_MODULE_NOT_FOUND
allowed-tools: Bash(npx:*)
---

Run `npx --no @theglitchking/semantic-sidekick healthcheck` and relay the output. If it reports a fragile `.mcp.json` form, suggest running `/semantic-sidekick:normalize-config`.
