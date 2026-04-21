---
name: vault-first
description: Default mode skill for semantic-sidekick. Treats the markdown vault as present context, not retrievable-on-demand storage. Activates on any operational, architectural, or "how/why/where does this project…" question about the current project, product, or codebase — including prose questions like "how do we deploy", "what's our process for X", "why is Y structured this way", "where does Z live", "how does auth work here", "what are the conventions", operational runbook questions, and gotcha/known-issue lookups. Also activates when hooks have injected <vault-context> blocks into the conversation. Does NOT activate on pure code-symbol lookups ("where is function X defined" → Grep) or on research/evaluative questions about external tools ("is there a better X than Y" → semantic-first's research flow). Coexists with semantic-first — semantic-first handles routing between docs index + research vault; vault-first is the behavioral mode that actually uses them on every relevant prompt rather than waiting to be asked.
---

# vault-first

**Default mode.** The vault is present, not retrievable. Use it on every relevant prompt, cite what you find, and say it out loud when you didn't find anything.

## Why this skill exists

A 500-note vault that Claude only consults when explicitly asked is a liability — the knowledge creates false confidence ("we've documented that") while being silently bypassed. `semantic-first` routes lookups *when Claude decides to look*. `vault-first` is the decision layer: for any project-scoped prose question, Claude looks *by default*, before answering from memory or guessing.

This skill is one of three mode skills in the sidekick routing system (`vault-first`, `research-mode`, `outage-silence`). It is the default when none of the others apply.

## When you are in vault-first mode

You are in vault-first mode when:

- The user's question is about **this specific project, product, or codebase** and the answer would naturally live in a design doc, runbook, ADR, troubleshooting guide, or decision log.
- The user asks "how", "why", "where", or "what's our X" about anything project-scoped.
- A hook has injected a `<vault-context>` block into the conversation — that block is the result of a proactive search; treat it as presented context, not a reference dump.
- None of the other mode skills (`research-mode`, `outage-silence`) have fired.

## What vault-first mode changes about your behavior

### 1. Look at injected context first

If the conversation contains a `<vault-context>` block (from `SessionStart` preload or `UserPromptSubmit` search-on-prompt), read the listed note paths and snippets before you do anything else. The hook already did a hybrid search for you — the top hits are sitting in front of you. Do not re-run the same search.

If the injected context is enough to answer, answer from it and cite the note paths.

### 2. If injected context is thin or missing, search the vault yourself

Call `mcp__semantic-vault__search_hybrid` (or `search_text` for exact-match needs) with the user's question as the query. Read 2–3 promising hits in full via `mcp__semantic-vault__read_note` before answering. Do not answer from snippets alone — snippets lose context and produce confidently wrong answers.

### 3. Cite, or say "not in vault"

Every answer in vault-first mode ends in one of two ways:

- **Cite:** "…per `runbooks/deploy-staging.md` and `decisions/2026-03-auth-migration.md`." List the paths so the user can open them.
- **Deflect:** "This isn't in the vault. Nearest matches were `X.md` and `Y.md` but neither covers Z. Want me to [search the web / ask more / file a stub note]?"

Do not silently pivot to web search, do not guess from training data, and do not say "the vault has something like this" without naming files. If you haven't named a file, you haven't cited.

### 4. Offer to capture when you fill a gap

If you had to answer from outside the vault (web search, training knowledge, the user telling you something new), offer once to file a note: *"Worth capturing this in the vault as `gotchas/foo.md`?"* — then let the user decide. This is the ingest loop's entry point; don't force it, but don't skip it.

## Boundary conditions — when vault-first does NOT fire

- **Code-symbol lookups.** "Where is `parseAuth` defined?" → `Grep`. "Show me the `User` model." → `Glob`. If the answer is a file + line, the vault is the wrong tool.
- **Pure external research.** "What's the best vector DB for <100k docs?" → `semantic-first`'s Flow B (research vault + web).
- **Active incidents.** If the user mentions "down", "broken", "customers", "rollback", "oncall", an alert timestamp, or pasted error logs, `outage-silence` takes over. Stop auto-firing search. Wait for explicit `/vault` request.
- **Meta-questions about Claude or the CLI.** "How do I use `/clear`?" → built-in help, not vault.

## Interaction with hooks

Two hooks participate in this mode:

- **`SessionStart` hook** — runs a hybrid search seeded from cwd and branch, injects the top-K hits as a `<vault-context>` block at session start. You should see it in your context when this skill first activates.
- **`UserPromptSubmit` hook** — runs a keyword search on each user prompt, fingerprinted against recent queries, and injects a `<vault-context>` block if the fingerprint is new. That is why you sometimes see injected hits and sometimes don't — the hook deliberately suppresses re-firing for near-identical prompts.

If you see `<vault-context source="sessionstart">` or `<vault-context source="prompt">` in your context, those are hook outputs. Treat them as the vault speaking first.

## What success looks like

- User asks "how do we handle MFA enforcement?" with no `vault-first` prior mention — you read the injected `<vault-context>` block, pull `features/authentication/mfa-enforcement-overview.md`, answer with citation. Tool budget: 1 read.
- User asks a project question where the hook injected nothing — you run `search_hybrid` yourself, read 2 hits, answer + cite. Tool budget: 2 reads + 1 search.
- User asks something genuinely not in the vault — you say "not in vault", name the nearest misses, offer to capture after the user gives you the answer.
- `outage-silence` fires — you go quiet on the vault, no proactive search, wait for `/vault`.

## What failure looks like

- Ignoring the `<vault-context>` block and running a fresh search anyway — wastes the preload work.
- Answering project questions from training data without citing the vault.
- Saying "the docs cover this" without naming the file.
- Silently falling back to `Grep` when the project question has an obvious prose answer in the vault.
- Firing vault-first during an outage and drowning the user in search context when they need terse operational help.
