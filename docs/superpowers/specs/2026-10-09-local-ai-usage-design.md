# local-ai-usage — design

Date: 2026-10-09. Status: approved 2026-10-09.

## Goal

Track Claude Code and Codex token use every week, without manual steps and without LLM
tokens. Keep a versioned history in swamp. Publish a redacted summary for a public
dashboard on kimberly-garmoe-web.

Success: after each completed week, on the first login or daily check, a new weekly snapshot exists, `public/summary.json` is updated and
pushed, and the dashboard shows whether token use goes down against the 2026-10-09 baseline.

## Context

- Pattern source: `@webframp/ai-usage` (Apache-2.0). It reads cloud billing APIs and the
  Anthropic Enterprise Analytics API. This project borrows its pattern (provider models,
  scan workflow with `allowFailure`, workflow-scope report, setup hints, observability
  metadata), not its code.
- Data sources are local logs:
  - Claude Code: `~/.claude/projects/**/*.jsonl`. Claude Code deletes transcripts after
    `cleanupPeriodDays` (default 30). Swamp snapshots are the long-term record.
  - Codex: `~/.codex/sessions/YYYY/MM/DD/*.jsonl` (kept since 2026-01).
- Baseline (2026-09-21 to 2026-10-09): 3.45B input tokens in 18 days (~192M/day), peak
  context ~965K, 81% of one project's subagent calls on Opus.

## Scope

Sub-project 1 (this spec): the collector, report, schedule, and publish step.
Sub-project 2 (separate spec): the dashboard page on kimberly-garmoe-web.

Out of scope: cloud providers, per-session public detail, LLM-based analysis.

## Components

New public repo `kagarmoe/local-ai-usage` (local path `~/repos/local-ai-usage`), a swamp
repo. Extensions are TypeScript (Deno).

| Unit | Responsibility |
|---|---|
| `@kagarmoe/local-ai-usage/claude-code` model | `scan(week)` reads one ISO week of Claude Code logs and writes the versioned `weekly` resource. `calibrate()` fits `prices.yaml` rates from `cost-state` records. `status()` reports configuration with setup hints. |
| `@kagarmoe/local-ai-usage/codex` model | `scan(week)` reads one ISO week of Codex logs and writes the versioned `weekly` resource. `status()` as above. |
| `@kagarmoe/local-ai-usage-report` | Workflow-scope report. Markdown: full private detail. JSON: the public contract (below), built from all stored weekly snapshots. |
| `local-ai-usage-weekly` workflow | Jobs: `scan-claude-code` and `scan-codex` in parallel (`allowFailure: true`) → report → `publish` (`command/shell`). No `trigger.schedule`: launchd runs it. |
| `prices.yaml` | Per-model rates (USD per million tokens) for input, cache read, cache write, output. Claude rates come from `calibrate()`. Codex rates are entered by hand. |
| `events.yaml` | Hand-edited list of config changes (`date`, `label`). The report copies it to `events` in the public JSON. |
| LaunchAgent `com.kagarmoe.local-ai-usage` | Runs `swamp workflow run local-ai-usage-weekly` in this repo at login (`RunAtLoad`) and daily at 09:17 (`StartCalendarInterval`; a time missed during sleep fires on wake). Logs in `~/Library/Logs/local-ai-usage.log`. No `swamp serve`. |

### Scan rules

- Week: ISO week in the local time zone. The workflow scans every completed week that has
  no snapshot, so the run needs no date logic. A run with no missing week does nothing;
  this catches up after the Mac was off. A re-scan writes a new version; the report uses the latest version per
  week.
- Claude Code:
  - Count each assistant message once, keyed by `message.id` (streaming writes repeats).
  - Tokens from `message.usage`: `input_tokens`, `cache_read_input_tokens`,
    `cache_creation_input_tokens`, `output_tokens`.
  - Subagent calls: messages in subagent transcripts (`isSidechain` or subagent files).
  - Cost per message: tokens × `prices.yaml` rate for `message.model`.
  - Cost check: for sessions with `cost-state` records, compare the summed estimate to the
    last `totalCostUSD`. Store `costCheck: { sessions, deltaPct }`.
- Codex:
  - Calls: `token_usage_record` events, keyed by `payload.response_id` (newer logs). In a
    file with no `token_usage_record`, use `token_count` events with `info` set, from
    `info.last_token_usage`, and count one only when `info.total_token_usage` changed
    (repeats otherwise). Never count both event types in one file.
  - Normalize to the Claude Code shape: `input` = `input_tokens` − `cached_input_tokens`;
    `cacheRead` = `cached_input_tokens`; `cacheWrite` = `cache_write_input_tokens`;
    `output` = `output_tokens`; `reasoning` = `reasoning_output_tokens` (part of
    `output`, not added). Logs confirm `total_tokens` = `input_tokens` + `output_tokens`,
    so `input_tokens` includes cached tokens. A fixture test keeps this true.
  - Model: the latest `turn_context.model` before the call.
  - Subagent calls: sessions whose `session_meta.source` has `subagent` (spawned threads
    and guardian reviews, model `codex-auto-review`).
  - Rate limits: peak `used_percent` per week from `rate_limits.primary` (5-hour window)
    and `rate_limits.secondary` (7-day window). The plan is a subscription, so these are
    the real budget; cost is an API-price comparison only.
  - Cost from `prices.yaml`; `null` for a model with no rate.
- Definitions: "input" = input + cache read + cache write (matches the baseline). "Long
  session" = more than 50 calls. "Session start" = context of a session's first call.
  "Context per call" = all prompt-side tokens of that call.

## Public data contract (`public/summary.json`)

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-19T08:17:00Z",
  "costBasis": "api-list-price-estimate",
  "baseline": { "label": "2026-09-21 – 2026-10-09",
                "claudeCode": { "inputPerDay": 192000000, "peakContext": 965000,
                                "subagentOpusShare": 0.81 },
                "codex": { "inputPerDay": 0, "peakContext": 0, "weeklyRateLimitPeakPct": 0 } },
  "events": [{ "date": "2026-10-09", "label": "Plugins and skills pruned" }],
  "weeks": [{
    "week": "2026-W41", "start": "2026-10-05", "status": "complete",
    "claudeCode": {
      "sessions": 0, "calls": 0,
      "tokens": { "input": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0 },
      "costUSD": 0, "costCheck": { "sessions": 0, "deltaPct": 0 },
      "perDay": [{ "date": "2026-10-05", "sessions": 0, "calls": 0,
                   "tokens": { "input": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0 },
                   "costUSD": 0, "models": {}, "subagentModels": {} }],
      "perHour": [{ "dow": 1, "hour": 9, "input": 0, "output": 0, "costUSD": 0,
                    "models": {}, "subagentModels": {} }],
      "models": { "claude-opus-5-5": { "calls": 0, "input": 0, "output": 0, "costUSD": 0 } },
      "subagentModels": { "claude-sonnet-5-5": { "calls": 0, "input": 0, "output": 0, "costUSD": 0 } },
      "context": { "avgLongSession": 0, "p95": 0, "peak": 0 },
      "sessionStartMedian": 0
    },
    "codex": {
      "sessions": 0, "calls": 0,
      "tokens": { "input": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0, "reasoning": 0 },
      "costUSD": null,
      "rateLimits": { "fiveHourPeakPct": 0, "weeklyPeakPct": 0 },
      "perDay": [{ "date": "2026-10-05", "sessions": 0, "calls": 0,
                   "tokens": { "input": 0, "cacheRead": 0, "cacheWrite": 0, "output": 0, "reasoning": 0 },
                   "costUSD": null, "models": {}, "subagentModels": {} }],
      "perHour": [{ "dow": 1, "hour": 9, "input": 0, "output": 0, "costUSD": null,
                    "models": {}, "subagentModels": {} }],
      "models": { "gpt-5.5": { "calls": 0, "input": 0, "output": 0, "costUSD": null } },
      "subagentModels": { "codex-auto-review": { "calls": 0, "input": 0, "output": 0, "costUSD": null } },
      "context": { "avgLongSession": 0, "p95": 0, "peak": 0 },
      "sessionStartMedian": 0
    }
  }]
}
```

- `events`: config changes to annotate on trend charts, copied from the hand-edited
  `events.yaml` in the repo. Labels are public; do not name private projects.
- `baseline.claudeCode` is the fixed 2026-10-09 measurement. `baseline.codex` is computed
  by the report from Codex snapshots for the same dates (logs go back to 2026-01).
- `claudeCode` and `codex` have the same shape, so one chart component draws both.
  Differences: `costCheck` is Claude Code only; `rateLimits` and `tokens.reasoning` are
  Codex only.
- `perDay`: 7 entries per tool per week, with the same breakdowns as the week. These feed
  the day drill-down.
- `perHour`: day of week × hour buckets (local time) per tool per week, with model
  mixes. Only hours with calls are stored; a missing bucket is zero. A day's hours are
  the buckets with that day's `dow`.
- `models` and `subagentModels` (week, day, and hour): absolute values per full model
  ID: `calls`, `input` (input + cache read + cache write), `output`, `costUSD`. The
  dashboard computes shares, so it can show the mix by tokens, cost, or calls.
- Size: sparse `perHour` keeps a year near 1 MB. shortcut: one file for all weeks;
  split into per-week files if `summary.json` passes 5 MB.
- A tool with no data for a week is `null`, not zeros.
- `status`: `complete`, or `incomplete` when the week starts before the oldest log on disk.
  The dashboard does not plot incomplete weeks.
- Each tool object also has `complete` (that tool's own flag), so a week that is incomplete for
  one tool can still plot the other.
- The public fields are an allowlist: anything else in a snapshot is dropped. A model id that is
  not a plain id (an ARN or a fine-tune id) is published as `other`.
- `schemaVersion` changes only for breaking changes.
- **Redaction:** the public JSON contains no project names, paths, session IDs, git
  branches, prompts, or tool names. These appear only in the private markdown (for
  example, per-project totals and per-project subagent mix).

## Publish step

`command/shell` step: write `public/summary.json` from the report JSON. If the file
changed, `git commit -m "chore(data): weekly summary <week>"` and `git push`. If nothing
changed, do not commit. A failed push fails the step; retry with
`swamp workflow resume local-ai-usage-weekly --run <id>`.

`.swamp/` (raw snapshots) is gitignored.

## Error handling

- Malformed JSONL lines: skip, count in `skippedLines`, show in the private markdown.
- Missing log directory: `status()` reports unconfigured with a setup hint; the workflow
  continues.
- Weeks older than the oldest log: `status: "incomplete"`.
- Cost check `deltaPct` above 2%: flag in the private markdown (price table drift).
- Buffer: set `cleanupPeriodDays: 60` in `~/.claude/settings.json`, so a month without
  runs loses no Claude Code data.

## Testing

Lean, automatic, in CI (`deno test` on GitHub Actions, plus swamp extension conformance):

- Parser fixtures: streamed repeats counted once; subagent attribution; malformed lines;
  ISO-week boundaries in local time. Codex: `token_usage_record` deduplicated by
  `response_id`; `token_count` fallback counts only changed totals; never both in one
  file; normalization (`input` excludes cached, `reasoning` not added); subagent and
  guardian attribution; 5-hour and 7-day rate-limit peaks.
- Cost: price calculation; one real `cost-state` session fixture within 2%.
- Redaction: fixtures with project names, paths, and session IDs; assert none appear in
  the public JSON.
- Report: a missing tool gives `null`; history accumulates across versions.

No end-to-end tests.

## Operations

- One-time backfill: run the workflow once after setup; it scans all completed weeks on
  disk (Claude Code ~6 weeks, Codex since 2026-01).
- Scanners must run on the machine that has the logs. A remote `swamp serve` (for
  example over Tailscale) cannot read them unless the logs are synced there.
- After 2026-10-16, remove the one-shot LaunchAgent `com.kagarmoe.token-check`.
- Beads: initialized with prefix `localai`.

## Later (not in this spec)

- Offer the two scanners upstream to `@webframp/ai-usage` as providers.

### Dashboard requirements (input to the sub-project 2 spec)

The dashboard is graphic. It fetches `summary.json` from the public repo with ISR. The
site has no chart library now (Next 16, React 19, Tailwind 4); sub-project 2 selects one.
Candidate: Observable Plot (SVG, renders on the server).

Layout: overview first, detail below.

1. KPI row, one row per tool. Claude Code: input per day, cost per week, peak context,
   subagent Opus share (by calls, as in the baseline). Codex: input per day, weekly
   rate-limit peak, peak context, cost per week (API-price comparison). Each tile shows
   the latest complete week, the change against the baseline, and a sparkline.
2. Trends: weekly input per day as a line, with the baseline as a reference line and
   `events` as annotations.
3. Breakdowns, one bar per week: tokens by type (stacked), estimated cost, model mix and
   subagent model mix (stacked by model), context avg/p95/peak (lines). Model mixes
   measure input tokens by default; `?by=cost` or `?by=calls` switches the measure (a
   link, so it works without JavaScript).
4. Detail: 7 × 24 heatmap of `perHour` for the latest complete week.
5. Claude Code and Codex: small multiples with a shared y-axis. No dual axes. A
   combined view stacks both tools to show total use.
6. Codex rate limits: weekly peaks of the 5-hour and 7-day windows as lines on a 0–100%
   axis, with a reference line at 100%.

Drill-down: all weeks → one week → one day → one hour.

- Each bar, point, and heatmap cell is an SVG link to a URL with the drill state
  (`?week=2026-W41`, then `&day=2026-10-07`). The server renders the drilled view. Drill
  works without JavaScript, each view has a shareable URL, and Back goes up one level.
- Week view: that week's days, tokens by type, model mixes, cost, and heatmap.
- Day view: 24 hourly bars stacked by model (main and subagent), tokens by type, and
  cost. This view shows which model used the tokens at each hour.
- Hour: tooltip with that hour's totals and per-model values (no separate view).
- A breadcrumb (All weeks › W41 › Wed 10-07) shows the level and links up.
- Public drill stops at the day. No session-level detail is public.

Chart rules:

- Bars start at zero. No pie, donut, or 3D charts.
- Each title states the finding (for example, "Input per day down 40% from baseline").
- Label lines and bars directly; use a legend only when direct labels do not fit.
- Colorblind-safe palette (Okabe-Ito). One color per model on all charts. Single-hue
  sequential scale for the heatmap.
- Units for people: "M tokens", "B tokens", "$". Cost is labeled "estimate at API list
  price".
- Incomplete weeks are not plotted. A `null` tool shows "no data", not zero.
- Light and dark themes.

Accessibility (WCAG 2.2 AA):

- Each chart has a one-sentence text summary and a data table in a `<details>` element.
- Color is never the only signal (labels, patterns, or markers too).
- Tooltips open on keyboard focus as well as hover. JavaScript adds hover tooltips; each
  mark also has an SVG `<title>`.
- Charts render as SVG on the server, so the page and drill-down work without JavaScript.
