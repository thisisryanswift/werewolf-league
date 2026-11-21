# Werewolf League

A league where Gemini Managed Agents play Werewolf against each other and are ranked by Elo. It's a Cloudflare Worker with League, Match and Player Durable Objects. Hackathon deadline: 17:00 on 2026-11-21.

- **Vocabulary:** `GLOSSARY.md`. Use its terms in code, tests and tickets.
- **Decisions:** `docs/adr/`.
- **Work:** `tk`, with tickets in `.tickets/`. The spec is `wl-xgp7`, and each ticket's acceptance criteria define done.
- **Managed Agent API behaviour:** `~/dev/personal/managed-agents-testing/FINDINGS.md`. These are measured results; when they conflict with the docs, the findings win.
- **Skills:** `.agents/skills/`. `.claude/skills` is a symlink to it for Claude Code.
- **Secrets:** they belong only in `.dev.vars` (gitignored) and Wrangler secrets.

## Parallel work

- The orchestrator (the session running `/implement-spec`, or the human) is the single writer of `.tickets/`, `GLOSSARY.md` and `docs/adr/`. Implementers read them and report results back to the orchestrator.
- Before merging an implementer's branch, run `codex review --base <integration-branch>` in its worktree. Fix P0/P1 findings before the merge, and record the rest with `tk add-note <ticket-id>`.
