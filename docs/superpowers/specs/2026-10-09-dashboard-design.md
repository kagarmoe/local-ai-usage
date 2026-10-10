# local-ai-usage dashboard — design

Sub-project 2 of local-ai-usage. This spec replaces "Dashboard requirements" in
`2026-10-09-local-ai-usage-design.md` wherever the two differ.

Swamp behavior this design relies on was verified on swamp `20261009.202715.0`. See the
Obsidian notes `Resources/swamp/swamp-practice.md` and `swamp-currency.md`.

## Goal

Show whether Claude Code and Codex token use goes down against the 2026-10-09 baseline,
and which models use the tokens. The dashboard is public at
`https://ai-usage.kimberlygarmoe.com`.

## Decisions

| Decision | Choice |
|---|---|
| Host | Separate Vercel project at `ai-usage.kimberlygarmoe.com`. Not part of kimberly-garmoe-web. |
| Owner | Swamp owns the data and the Vercel resources. It renders the data, uploads it to Vercel Blob, and creates the Blob store, the project and the domain. |
| Site data | Two files in a public Vercel Blob store: `data/weeks.jsonl` and `data/meta.json`. They are swamp data, not committed to git. |
| Upload | The `vercel blob put` CLI (Vercel CLI 63.1.0), run by a small extension model. No raw Blob API calls. |
| Build | Git-linked Vercel project, root directory `site/`. Vercel builds on push only when `site/` changed. Daily data changes need no build. |
| UI | Vite, React, Tailwind, shadcn/ui (`Card`, `Chart`, `Table`). shadcn default theme; do not match the kimberly-garmoe-web palette. |
| Charts | shadcn `Chart` (Recharts). The browser draws charts from `weeks.jsonl`. JavaScript is required. |
| Schedule | The existing LaunchAgent runs `swamp workflow run local-ai-usage-weekly` (login + 09:17). `trigger.schedule` needs `swamp serve`; bead `localai-jao` tracks that move. |
| Scope | Trimmed v1. Bead `localai-mdf` tracks the full implementation. |

## Architecture

```
scan → build → render ──→ upload           (workflow local-ai-usage-weekly)
              summary  │   dashboard-data → Vercel Blob
                       └→ publish          (existing: git commit + push)

browser → ai-usage.kimberlygarmoe.com/data/* ──rewrite──→ Blob store
```

Models communicate only through CEL data chaining (`data.latest(...)`).

### Model type `@kagarmoe/local-ai-usage/dashboard-data` (new)

- Global argument `public`: the public summary object. The definition sets it with
  `${{ data.latest("summary", "summary").attributes.public }}`.
- Method `render`:
  1. Throw if `public.schemaVersion` is not 1.
  2. Build `weeks.jsonl` (one line per week) and `meta.json`.
  3. Write resource `data` **once, as the last step**:
     `{ hash, files: [{ pathname, content }] }`. `pathname` is `data/weeks.jsonl` or
     `data/meta.json`. `hash` is the SHA-256 of the pathnames and contents, sorted by
     pathname, computed with `generatedAt` left out of `meta.json`. `generatedAt` is the
     latest scan time and changes every run, so including it would defeat the upload
     guard. The uploaded `meta.json` therefore keeps the `generatedAt` of the last
     *changed* data, and the site labels it "Data as of".
  - No `rollbackOnFailure`: with a single write at the end, it adds nothing. (In this swamp
    version it only works when set on the TypeScript method; the definition-YAML form is
    ignored.)
- Resource lifetime: infinite. Garbage collection: 10 versions.
- Logic lives in `_lib/dashboard_data.ts` (pure functions); the model file only wires it.

### Model type `@kagarmoe/local-ai-usage/blob-upload` (new)

- Global argument `token`: `z.string().meta({ sensitive: true })`. The definition sets
  `${{ vault.get("secrets", "vercel-token") }}`. A literal value is rejected. There is no
  Blob token in the vault: the store is connected to the `ai-usage` project, and the
  method pulls the store's read-write token from the project on each run.
- Method `put`. Arguments: `files` (`[{ pathname, content }]`) and `hash`.
  1. Make a temp directory.
  2. Run `vercel env pull <tmp>/.env.pulled --environment development --yes` with `cwd`
     set to the repo root (linked to `ai-usage` by `vercel link`; `.vercel/` is
     gitignored), and env `VERCEL_TOKEN` set from `token`. Read `BLOB_READ_WRITE_TOKEN` from the
     pulled file.
  3. Write each file to the temp directory. For each, run
     `vercel blob put <file> --pathname <pathname> --access public --allow-overwrite --cache-control-max-age 3600 --content-type <type>`
     with `Deno.Command`, `cwd` set to the temp directory, and the pulled token in env
     `BLOB_READ_WRITE_TOKEN`. The token never goes in argv. A non-zero exit throws with
     the CLI's stderr.
     - `--allow-overwrite` and `--add-random-suffix` are on/off flags: a following
       `true`/`false` is ignored, so `--add-random-suffix false` turns the suffix **on**.
       Omit `--add-random-suffix` (the default is off). Verified by the spike.
     - `cwd` must not be the repo root: a `.env.local` there holding `VERCEL_OIDC_TOKEN`
       (written by `vercel link`) makes the CLI refuse to run without `BLOB_STORE_ID`.
  4. Remove the temp directory, including the pulled file (in `finally`).
  5. Only after every upload succeeds, write resource `upload`:
     `{ hash, pathnames, uploadedAt }`.
- A failed run therefore records no new hash, and the next run retries.
- Logic lives in `_lib/blob_upload.ts`, following the `_lib/publish.ts` pattern.
- `vercel` is at `/opt/homebrew/bin`, which is already on the LaunchAgent's `PATH`.

### Definitions

All definitions have tags `project: local-ai-usage` and `component: dashboard`. Each
`@swamp/vercel` definition sets `teamId: team_SMACO8iOr6wPIGx5as56P468` and
`token: ${{ vault.get("secrets", "vercel-token") }}`.

| Definition | Type | Key arguments |
|---|---|---|
| `dashboard-data` | `@kagarmoe/local-ai-usage/dashboard-data` | `public` (CEL, above) |
| `dashboard-upload` | `@kagarmoe/local-ai-usage/blob-upload` | `token` (vault `vercel-token`, above) |
| `dashboard-blob` | `@swamp/vercel/blob-storage/blob` | store name `ai-usage`, public access, `projectId: ${{ data.latest("dashboard-project", "ai-usage").attributes.id }}` (sent only by `create`; it connects the store to the project) |
| `dashboard-project` | `@swamp/vercel/projects/projects` | `name: ai-usage`, `framework: vite`, `rootDirectory: site`, `gitRepository: kagarmoe/local-ai-usage` |
| `dashboard-domain` | `@swamp/vercel/projects/domains` | `idOrName:` project ID (CEL), `name: ai-usage.kimberlygarmoe.com` |

Exact argument names come from `swamp model type describe <type> --json` at
implementation time.

### Workflows

- `dashboard-setup` (new, run by hand, repeatable):
  1. `dashboard-project.create`, then `dashboard-blob.create` (its `projectId` reads the
     project's data). Each has a guard that skips the step when its data exists.
  2. `dashboard-domain.create`. It has a guard that skips the step when the domain data
     exists. The blob and domain steps each depend on the project step with
     `{type: or, conditions: [{type: succeeded}, {type: skipped}]}`. A guarded skip
     otherwise cascades: a plain `succeeded` or `completed` dependent is skipped too.
- `local-ai-usage-weekly` (changed):
  - Step `render`: `dashboard-data.render`. Depends on `build` succeeded.
  - Step `upload`: `dashboard-upload.put`, with inputs
    `files: ${{ data.latest("dashboard-data", "data").attributes.files }}` and
    `hash: ${{ data.latest("dashboard-data", "data").attributes.hash }}`. Depends on
    `render` succeeded. Guard:
    `${{ data.latest("dashboard-upload", "upload").?attributes.?hash.orValue("") == data.latest("dashboard-data", "data").attributes.hash }}`.
    This skips unchanged data (the workflow runs at login and at 09:17) and works before
    the first upload.
  - `publish` is unchanged and independent of `render` and `upload`.

The `secrets` vault holds `vercel-token`. The user stores it with
`swamp vault put secrets vercel-token`.

kimberlygarmoe.com uses Vercel nameservers, so the subdomain needs no DNS change outside
Vercel.

## Data files

- `data/weeks.jsonl`: one line per week. Each line is the week object from
  `summary.public.weeks`, unchanged, in the same order (newest first).
- `data/meta.json`: `{ schemaVersion, generatedAt, costBasis, baseline, events }`.

They follow the public data contract in the original spec. Blob objects are cached for
one hour (`max-age=3600`), so the site may show data up to an hour old after an upload.

## Site (`site/`)

- Vite, React 19, TypeScript, Tailwind 4, shadcn/ui. Exact versions in `package.json`
  (no `^` or `~`). `package-lock.json` is committed.
- Build: `tsc -b && vite build`. A type error fails the Vercel build, and the live site
  stays on the last good deployment.
- `site/vercel.json`:
  - `rewrites`: `/data/:path*` →
    `https://rofnqrehqsduqz7m.public.blob.vercel-storage.com/data/:path*` (store
    `store_RoFNqrEhQsDUqZ7m`; confirmed by the spike).
  - `ignoreCommand`: `git diff --quiet HEAD^ HEAD -- .`. Skips the build when `site/` did
    not change, for example after the daily data commit.
- Local dev: the Vite dev server proxies `/data` to the same Blob host.
- `src/lib/shape.ts`: pure functions with no imports. They turn weeks into chart rows.
  The React components only display rows.
- Routing: `URLSearchParams`. Drill links are plain `<a href="?week=…&day=…">`, so Back
  goes up one level and every view has a shareable URL. No router library.
- Theme: shadcn default variables. `--chart-1` … `--chart-8` are set to Okabe-Ito.
  Dark mode follows `prefers-color-scheme`.

## Pages and charts (v1)

### All weeks (`/`)

1. **KPI row**, one `Card` per metric. Each card shows the latest complete week, the
   baseline, and the change in percent.
   - Claude Code: input per day, peak context, subagent Opus share (by calls).
   - Codex: input per day, peak context, weekly rate-limit peak.
   - Input per day = (input + cacheRead + cacheWrite) / 7, the same formula as the
     baseline.
2. **Trend**: input per day by week, one panel per tool. A dashed reference line shows
   the baseline. Each event in `events` is a labeled vertical marker.
3. **Tokens by type**: one stacked bar per week (input, cache read, cache write, output;
   Codex also reasoning). One chart per tool.
4. **Model mix**: input per week, stacked by model. One chart per tool.
5. **Heatmap**: 7 × 24 table of input by weekday and hour, summed over all complete
   weeks.
6. **Week list**: every week with data, newest first, linked to its week view.
   Incomplete weeks are marked "incomplete".

### Week (`?week=2026-W41`)

The KPI row for that week, tokens by type and model mix per day, the week's heatmap, and
links to each day. A breadcrumb (All weeks › W41) links up.

### Day (`?week=2026-W41&day=2026-10-07`)

Hourly bars of input stacked by model, from the `perHour` rows of that week whose `dow`
matches the day (ISO weekday, Monday = 1). Breadcrumb: All weeks › W41 › Wed 10-07.

### Chart rules

- Bars start at zero. No pie, donut, or 3D charts.
- Each chart title states the finding, for example "Input per day down 40% from
  baseline".
- One color per model on all charts. The 7 models with the most input get a color;
  the rest are grouped as "other".
- The heatmap uses one hue at increasing strength.
- Units: "K tokens", "M tokens", "B tokens".
- Incomplete weeks are not plotted. A `null` tool shows "no data", not zero.
- An unknown `?week=` or `?day=` shows "No data for <value>" and a link to All weeks.

### Accessibility (WCAG 2.2 AA)

- Each chart has a one-sentence summary and a data table (shadcn `Table` in a
  `<details>` element).
- Charts set Recharts `accessibilityLayer`, so tooltips open on keyboard focus.
- Color is never the only signal: legends name each series, and the table has the
  values.
- The heatmap is an HTML `<table>` with a header row and header column.
- A `<noscript>` line says that the dashboard needs JavaScript.

## Error handling

| Failure | Result |
|---|---|
| Summary missing or wrong `schemaVersion` | `render` throws and writes nothing. `upload` does not run. The site keeps the last uploaded data. |
| `vercel-token` invalid, `vercel env pull` fails, CLI error, or Blob down | `upload` throws and records no hash. The next run retries. `publish` is not affected. The failure shows in `swamp workflow history` and `~/Library/Logs/local-ai-usage.log`. |
| A run with no new usage (for example login, then 09:17) | The `upload` guard skips the step. |
| Vercel build fails | Production stays on the last good deployment. |
| Data files fail to load in the browser | The page shows "Could not load usage data" and no charts. |

## Testing

`deno task test` runs all tests. No new test framework.

- `_lib/dashboard_data.ts` (unit, fixture `public` object):
  - `weeks.jsonl` has one line per week, newest first.
  - The hash is stable when only `generatedAt` differs, and changes when any week
    changes.
  - A wrong `schemaVersion` throws.
- `_lib/blob_upload.ts` (unit, a stub `vercel` script on `PATH` in a temp dir):
  - A non-zero exit throws.
  - The pulled token reaches the stub `blob put` through env, not argv, and the pulled
    file is gone afterwards.
  - The argv has no `--add-random-suffix` (regression for the spike finding).
- `site/src/lib/shape.ts` (unit; the test task adds `site/src/lib/`):
  - Incomplete weeks are left out of trends.
  - The top-7 plus "other" grouping.
  - `dow` to date for a week.
  - KPI change against the baseline.
- Swamp: `swamp workflow validate` for both workflows. Run the weekly workflow twice.
  Running AI sessions write to the scanned logs, so compare the two `dashboard-data`
  hashes: if they are equal, the second run must show `upload` skipped
  (`swamp workflow history get`). If they differ, it must upload.
- No end-to-end test. After the first deploy, check the three views once with headless
  Playwright screenshots, light and dark. This is a one-time check, not a CI test.

## Rollout

1. **Spike (first task, throwaway; needs the user's approval because it creates Vercel
   resources):** run `dashboard-setup` for the Blob store only. Then confirm:
   - `vercel blob put` with only `BLOB_READ_WRITE_TOKEN` in env uploads non-interactively;
   - a second put to the same pathname overwrites with no suffix;
   - the public URL serves the file.
   If the CLI needs a login or a linked project, call the Blob API from `_lib/blob_upload.ts`
   instead. Interfaces stay the same.
   **Done 2026-10-10** (see Status below): all three hold, with the flag fix above.
2. Build `dashboard-data`, `blob-upload`, the site, and the workflow steps.
3. Run `dashboard-setup` in full (project, domain), push the branch, check the views, and
   merge branch `dashboard` into `main`.

Creating the Blob store, the project and the domain, and pushing before the merge,
each need the user's approval.

**Status 2026-10-09:** the user approved the store. `dashboard-blob.create` ran from the main
checkout, because the `secrets` vault lives there; a worktree has its own empty `.swamp/`. It
created `store_blBRxMbrxzEnI88l` (public, `iad1`). The definition and the extension lockfile are
committed on `dashboard`. The main checkout holds identical uncommitted copies; discard them
(`git checkout -- extensions/models/upstream_extensions.json` and remove
`models/@swamp/vercel/blob-storage/`) right before merging. Run all later swamp setup and
spike steps from the main checkout for the same reason.

**Status 2026-10-09 (project):** the user approved it. `dashboard-project.create` made
`prj_EgYL9x4XYklFy2fVnxD9jhQJmSDH` (`ai-usage`, Vite, Node 24.x), git-linked to
`kagarmoe/local-ai-usage` with production branch `main`; no deployments yet. `site/` is not on
`main` yet, so phase 1 leaves `rootDirectory` unset and ignores builds with
`git diff --quiet HEAD^ HEAD -- site`; the daily data push is skipped. **When `site/` lands**,
change the definition to `rootDirectory: site` and
`commandForIgnoringBuildStep: git diff --quiet HEAD^ HEAD -- .`, then run
`dashboard-project.update`. That replaces `site/vercel.json`'s `ignoreCommand`, which is then not
needed. The `@swamp/vercel/projects` extension warns that `creator.via` is null and doesn't
match its schema. This is harmless.

**Status 2026-10-10 (store recreated, spike done):** the first store (`store_blBRxMbrxzEnI88l`)
was not connected to the project, and the extension sends `projectId` only in `create`, so with
the user's approval it was deleted (empty) and recreated through swamp with `projectId` set.
The new store is `store_RoFNqrEhQsDUqZ7m`, host `rofnqrehqsduqz7m.public.blob.vercel-storage.com`,
connected to `ai-usage` in production, preview and development; Vercel added
`BLOB_READ_WRITE_TOKEN` to the project. The main checkout is `vercel link`ed (`.vercel/` and
`.env*` are ignored via `.git/info/exclude` there and via `.gitignore` on this branch). Spike
results, via `vercel blob put` with the pulled token:
- Without `--add-random-suffix`, puts land at the exact pathname; a second put overwrites.
- A brand-new store's public host returned 404 for about two minutes, then served the file.
- After an overwrite, the public URL served the new content within about 5 seconds
  (`x-vercel-cache: HIT`, `cache-control: public, max-age=3600`).
Not yet verified: that `vercel env pull` authenticates from env `VERCEL_TOKEN` (the spike used
the CLI login). The `blob-upload` task checks this first, with an empty `--global-config`
so the login can't mask it. If it fails, drop `VERCEL_TOKEN` and rely on the CLI login (the
LaunchAgent runs as the user); never put the token in argv.

## Out of scope (bead `localai-mdf`)

Cost charts, subagent model mix chart, context chart, Codex rate-limit chart, `?by=`
switch, combined Claude Code + Codex view, KPI sparklines, and the hour level of the
drill-down.
