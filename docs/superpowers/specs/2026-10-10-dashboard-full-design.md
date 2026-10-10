# local-ai-usage dashboard — full chart set (bead `localai-mdf`)

Extends `2026-10-09-dashboard-design.md` (v1). Everything there stands unless this spec
says otherwise. Data, swamp, Blob, and Vercel do not change: this is a `site/` change only.

## Goal

Build every chart in the original "Dashboard requirements"
(`2026-10-09-local-ai-usage-design.md`) that v1 deferred, including the Week and Day
drill-down views. User instruction, 2026-10-10: "All of the charts. Continue until they
are all done and build."

## Decisions

| Decision | Choice |
|---|---|
| Routing | Client-side query string on one page: `?week=2026-W40`, `&day=2026-09-29`, `&by=cost`. `history.pushState`; Back goes up one level after drilling down. No router dependency. |
| Drill targets | Only plotted weeks (complete, from the tool's first week with data). An unknown or incomplete week shows the overview with a notice. A day outside the week shows the week with a notice. |
| Drill entry | Links (keyboard and screen reader) in a week list and a day list, plus clickable bars. Public drill stops at the day; an hour is a tooltip. |
| Model colors | Per tool. A tool's palette is its 7 models with the most input over all plotted weeks (main thread and subagents), then "other". Every chart of that tool, at every level and for every measure, uses that palette, so a model keeps its color. The two tools' model sets do not overlap. |
| Model mix | v1's single mix (main + subagent) splits into "Model mix" (main thread) and "Subagent model mix". |
| `?by=` | `input` (default), `cost`, `calls`. Applies to every model-mix chart on the page. A link group switches it and keeps `week` and `day`. |
| Codex cost | `prices.yaml` has `codex: {}` (entered by hand; none yet). Codex cost charts and the Codex cost tile show "no data". No prices are invented. |
| Shared y-axis | A "Both tools" card shows input per day as two small panels with one y-domain, plus a stacked bar of weekly input by tool. The per-tool charts keep their own axes, because Codex input is about 1% of Claude Code's and would be flat on a shared axis. |
| Opus share | Subagent calls on models whose id contains `opus`, over all subagent calls, in percent. The baseline (81%) was measured on one project; public data has no project split. |
| Percent change | Tiles in `%` show the change in percentage points ("up 4 points from baseline"); others in percent. |
| Heatmap | Overview: summed over all complete weeks (v1). Week view: that week only. |
| Direct labels | Line charts label each line at its last point and use a different dash pattern per line. Stacked bars keep the legend (direct labels on up to 8 segments collide). |
| SVG `<title>` per mark | Not added. That rule served the server-rendered, no-JS design v1 dropped. Recharts `accessibilityLayer` keyboard tooltips and the data tables cover it. |

## Overview (`/`)

Top to bottom:

1. **KPI rows**, one row per tool, four tiles each. Each tile: latest complete week,
   baseline, change, and a sparkline of the metric over the tool's plotted weeks.
   - Claude Code: input per day, cost per week ($), peak context, subagent Opus share (%).
   - Codex: input per day, weekly rate-limit peak (%), peak context, cost per week ($).
   - Cost has no baseline; the tile says "no baseline".
2. **Trend** per tool (v1).
3. **Both tools**: small multiples of input per day with one y-domain; a stacked bar of
   weekly input (input + cache read + cache write) by tool.
4. **Measure switch** (`Input`, `Cost`, `Calls`), then **Model mix** and **Subagent model
   mix** per tool.
5. **Tokens by type** per tool (v1).
6. **Cost** per tool: one bar per week, dollars, titled and summarised as "estimate at API
   list price".
7. **Context** per tool: avg (long sessions), p95, and peak as lines, with the baseline
   peak as a dashed reference line.
8. **Codex rate limits**: 5-hour and weekly window peaks as lines, y-axis 0–100%,
   reference line at 100%.
9. **Heatmap** (v1, all complete weeks).
10. **Weeks**: a list of links to each plotted week, newest first.

## Week view (`?week=`)

Breadcrumb `All weeks › 2026-W40`. Day links (`Mon 09-28` … `Sun 10-04`). Per tool, one
bar per day: tokens by type, cost, model mix, subagent model mix. Then the week's
heatmap. A day missing from a tool's `perDay` is zero (the tool has data that week). A tool
with no data that week shows "no data".

## Day view (`?week=&day=`)

Breadcrumb `All weeks › 2026-W40 › Tue 09-29`. Per tool, 24 hourly bars (`00:00` …
`23:00`): model mix and subagent model mix (by the measure), input and output, and cost.
`perHour` has no cache split, so the hourly token chart stacks input (cache included)
and output, and the summary sentence gives the day's totals by type from `perDay`.

## Chart rules (additions to v1)

- Titles state the finding: the top model, the peak day or hour, the latest value against
  the baseline. A chart with no data says so in its title and shows "No data" in place
  of the chart.
- Units: tokens as K/M/B (`fmt`; 999,999 shows "1M", not "1000K"); money as `$803`,
  `$1.2K`, `$0.42`; percent as `32%`. Tooltips use the same units.
- Colors: tokens-by-type and line series use `--chart-1…`; models use the tool palette;
  "other" is `--chart-8`.

## Accessibility (additions to v1)

- Drill links are real `<a href>` links; a click without modifier keys navigates in
  place; others open normally.
- After navigation the view heading gets focus.
- The measure switch marks the current measure with `aria-current="true"`.
- Sparklines are `aria-hidden`; the tile text carries the value.

## Code layout

- `site/src/lib/shape.ts` (pure, no imports): types, palette, mixes, KPI tiles, weekly
  rows, formatting.
- `site/src/lib/drill.ts` (pure, imports only `./shape.ts`): view parsing, links, day
  and hour rows.
- Components: `Charts.tsx` (overview charts and shared chart parts), `KpiCards.tsx`,
  `Heatmap.tsx` (takes a grid), `Nav.tsx` (link and navigation context), `Drill.tsx`
  (breadcrumb, measure switch, lists, Week and Day views), `App.tsx` (routing).
- `components/ui/chart.tsx`: `ChartTooltipContent` gets a `valueFormatter` prop.

## Testing

`deno task test` (runs in CI). Unit tests on pure logic only:

- palette and mixes: the same model keeps its key across main, subagent, and measures;
  null cost gives null cells; a tool with no data gives null rows; empty series drop.
- KPI tiles: Opus share by calls; change in points for `%`; no baseline gives no change.
- `fmt` at 999,999 (regression); `money`.
- Both-tools rows.
- `parseView`: valid week and day; unknown week; incomplete week; day outside the week;
  bad `by`. `href` keeps state and drops the default measure.
- Day rows (missing day is 0, null tool is null) and hour rows (only that weekday).

No component tests (no React test setup; v1 did not add one). `npm run build` must pass.
Then a one-time local check on real data with headless Playwright: overview, a week, and a
day, light and dark, 0 console errors; viewport screenshots.

## Out of scope

Codex prices, per-project data, session-level detail, server rendering, bundle splitting.
