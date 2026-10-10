# local-ai-usage

Weekly Claude Code and Codex token use, from local logs, tracked with [swamp](https://swamp-club.com).

- `public/summary.json`: the public, redacted weekly summary (schema in `docs/superpowers/specs/2026-10-09-local-ai-usage-design.md`). Costs are estimates at API list price.
- Runs on the Mac that has the logs: launchd runs `swamp workflow run local-ai-usage-weekly` at login and daily.
- Tests: `deno task test`.
