import { z } from "npm:zod@4";
import type { Tool, WeeklySnapshot } from "./scan.ts";

export type Event = { date: string; label: string };

const BASELINE = { label: "2026-09-21 – 2026-10-09", from: "2026-09-21", to: "2026-10-08", days: 18 };
const CLAUDE_BASELINE = { inputPerDay: 192_000_000, peakContext: 965_000, subagentOpusShare: 0.81 };

/** Codex numbers for the Claude Code baseline dates. shortcut: peaks use whole weeks W39–W41 (W41 runs past 10-09). */
function codexBaseline(snaps: WeeklySnapshot[]) {
  const weeks = snaps.filter((s) => s.tool === "codex" && s.summary && s.start >= BASELINE.from && s.start <= BASELINE.to);
  if (!weeks.length) return null;
  const days = weeks.flatMap((s) => s.summary!.perDay).filter((d) => d.date >= BASELINE.from && d.date <= BASELINE.to);
  return {
    inputPerDay: Math.round(days.reduce((n, d) => n + d.tokens.input + d.tokens.cacheRead + d.tokens.cacheWrite, 0) / BASELINE.days),
    peakContext: Math.max(...weeks.map((s) => s.summary!.context.peak)),
    weeklyRateLimitPeakPct: Math.max(...weeks.map((s) => s.rateLimits?.weeklyPeakPct ?? 0)),
  };
}

// The public allowlist: z.object drops every key not named here, at every level, and fixes key order.
const n = z.number(), nn = z.number().nullable();
// Model ids are raw log strings: an ARN or a fine-tune id can carry an account or org id, so it is published as "other".
const PLAIN_ID = /^[a-z0-9][a-z0-9._\-\[\]]*$/i;
const Stat = z.object({ calls: n, input: n, output: n, costUSD: nn });
type Stat = z.infer<typeof Stat>;
const Mix = z.record(z.string(), Stat).transform((m) => {
  const out: Record<string, Stat> = {};
  for (const [k, v] of Object.entries(m)) {
    const key = PLAIN_ID.test(k) ? k : "other", o = out[key];
    out[key] = !o ? v : {
      calls: o.calls + v.calls, input: o.input + v.input, output: o.output + v.output,
      costUSD: o.costUSD === null && v.costUSD === null ? null : (o.costUSD ?? 0) + (v.costUSD ?? 0),
    };
  }
  return out;
});
const Tokens = z.object({ input: n, cacheRead: n, cacheWrite: n, output: n, reasoning: n.optional() });
const PublicTool = z.object({
  complete: z.boolean(),
  sessions: n, calls: n, tokens: Tokens, costUSD: nn,
  perDay: z.array(z.object({ date: z.string(), sessions: n, calls: n, tokens: Tokens, costUSD: nn, models: Mix, subagentModels: Mix })),
  perHour: z.array(z.object({ dow: n, hour: n, input: n, output: n, costUSD: nn, models: Mix, subagentModels: Mix })),
  context: z.object({ avgLongSession: n, p95: n, peak: n }),
  sessionStartMedian: n,
  models: Mix, subagentModels: Mix,
  costCheck: z.object({ sessions: n, deltaPct: n }).optional(),
  rateLimits: z.object({ fiveHourPeakPct: nn, weeklyPeakPct: nn }).optional(),
});
const publicTool = (s: WeeklySnapshot | undefined) =>
  s?.summary ? PublicTool.parse({ ...s.summary, complete: s.complete, costCheck: s.costCheck, rateLimits: s.rateLimits }) : null;

/** The public contract. Reads only `summary`, `costCheck`, and `rateLimits` from snapshots; `private` never leaves. */
export function buildSummary(snaps: WeeklySnapshot[], events: Event[]) {
  const get = (week: string, tool: Tool) => snaps.find((s) => s.week === week && s.tool === tool);
  const weeks = [...new Set(snaps.map((s) => s.week))].sort().reverse(); // newest first; publish names its commit after weeks[0]
  return {
    schemaVersion: 1,
    // From snapshot times, not the clock: a run with no new snapshot writes an identical file.
    generatedAt: snaps.reduce((m, s) => (s.scannedAt > m ? s.scannedAt : m), ""),
    costBasis: "api-list-price-estimate",
    baseline: { label: BASELINE.label, claudeCode: CLAUDE_BASELINE, codex: codexBaseline(snaps) },
    events,
    weeks: weeks.map((week) => {
      const cc = get(week, "claudeCode"), cx = get(week, "codex");
      return {
        week,
        start: (cc ?? cx)!.start,
        status: [cc, cx].some((s) => s && !s.complete) ? "incomplete" : "complete",
        claudeCode: publicTool(cc),
        codex: publicTool(cx),
      };
    }),
  };
}

const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : String(n));
const usd = (n: number | null) => (n === null ? "n/a" : `$${n.toFixed(2)}`);

/** Private detail for `swamp report get`. Contains project names: never publish. */
export function renderMarkdown(snaps: WeeklySnapshot[]): string {
  const out = ["# local-ai-usage (private)", ""];
  const sorted = [...snaps].sort((a, b) => b.week.localeCompare(a.week) || a.tool.localeCompare(b.tool));
  for (const s of sorted) {
    out.push(`## ${s.week} ${s.tool}${s.complete ? "" : " (incomplete)"}`, "");
    if (!s.summary) {
      out.push("No data.", "");
      continue;
    }
    const t = s.summary.tokens;
    out.push(`Calls ${s.summary.calls}, sessions ${s.summary.sessions}, input ${fmt(t.input + t.cacheRead + t.cacheWrite)}, output ${fmt(t.output)}, cost ${usd(s.summary.costUSD)}.`);
    if (s.costCheck && Math.abs(s.costCheck.deltaPct) > 2) {
      out.push(`**Price drift:** estimate differs from Claude Code's cost by ${s.costCheck.deltaPct}% over ${s.costCheck.sessions} sessions. Check prices.yaml.`);
    }
    if (s.private.unpricedModels.length) out.push(`**Unpriced models:** ${s.private.unpricedModels.join(", ")}. Add rates to prices.yaml.`);
    if (s.private.skippedLines) out.push(`Skipped lines: ${s.private.skippedLines}.`);
    out.push("", "| Project | Calls | Input | Output | Cost |", "|---|---|---|---|---|");
    for (const [p, v] of Object.entries(s.private.projects).sort((a, b) => b[1].input - a[1].input).slice(0, 10)) {
      out.push(`| ${p} | ${v.calls} | ${fmt(v.input)} | ${fmt(v.output)} | ${usd(v.costUSD)} |`);
    }
    const sub = Object.entries(s.private.subagentModelsByProject);
    if (sub.length) {
      out.push("", "Subagent calls by project and model:");
      for (const [p, m] of sub) out.push(`- ${p}: ${Object.entries(m).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
    out.push("");
  }
  return out.join("\n");
}
