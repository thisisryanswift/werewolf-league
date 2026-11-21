# Vendored skills

These are copied unchanged from the official upstream repos on 2026-11-21. To update, re-copy them from upstream.

| Skill | Upstream | Commit |
| --- | --- | --- |
| gemini-api-dev | https://github.com/google-gemini/gemini-skills (Apache-2.0) | c4d0c62 |
| durable-objects, workers-best-practices, wrangler, workers-development | https://github.com/cloudflare/skills (Apache-2.0) | 5108325 |
| modern-web-guidance | https://github.com/GoogleChrome/modern-web-guidance (Apache-2.0) | 64a6d70 |

Upstream also offers these, which aren't vendored here:
- `gemini-api-cli` needs the `gemini-api` CLI.
- `agents-sdk` isn't needed; we use plain Durable Objects, not the Agents SDK.
- `chrome-extensions` (from modern-web-guidance) isn't relevant.

`modern-web-guidance` calls its CLI at runtime via `npx -y modern-web-guidance@latest search/retrieve`, so it needs network access and Node.
