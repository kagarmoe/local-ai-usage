import { isoDow, localDate } from "./week.ts";

/** One model call, normalized across tools. `project` is private: it stays in the snapshot's `private` block. */
export type Call = {
  ts: Date;
  session: string; // main session id, or the subagent's file path
  main: boolean; // false for subagent calls
  model: string;
  project: string;
  input: number; // uncached input
  cacheRead: number;
  cacheWrite: number;
  output: number;
  reasoning: number; // part of output (Codex only); never added to it
  costUSD: number | null;
};

export type ModelStat = { calls: number; input: number; output: number; costUSD: number | null };
export type Tokens = { input: number; cacheRead: number; cacheWrite: number; output: number; reasoning?: number };
type Mixes = { models: Record<string, ModelStat>; subagentModels: Record<string, ModelStat> };
export type DayStat = { date: string; sessions: number; calls: number; tokens: Tokens; costUSD: number | null } & Mixes;
export type HourStat = { dow: number; hour: number; input: number; output: number; costUSD: number | null } & Mixes;
export type ToolWeek = {
  sessions: number;
  calls: number;
  tokens: Tokens;
  costUSD: number | null;
  perDay: DayStat[];
  perHour: HourStat[];
  context: { avgLongSession: number; p95: number; peak: number };
  sessionStartMedian: number;
} & Mixes;

export const LONG_SESSION_CALLS = 50;

/** Prompt-side tokens of a call: the spec's "input". */
export const context = (c: Call): number => c.input + c.cacheRead + c.cacheWrite;

/** Sum of priced calls; null only when nothing is priced. */
const addCost = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);

function mix(calls: Call[]): Mixes {
  const m: Mixes = { models: {}, subagentModels: {} };
  for (const c of calls) {
    const s = ((c.main ? m.models : m.subagentModels)[c.model] ??= { calls: 0, input: 0, output: 0, costUSD: null });
    s.calls++;
    s.input += context(c);
    s.output += c.output;
    s.costUSD = addCost(s.costUSD, c.costUSD);
  }
  return m;
}

function totals(calls: Call[], withReasoning: boolean): { tokens: Tokens; costUSD: number | null } {
  const tokens: Tokens = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  if (withReasoning) tokens.reasoning = 0;
  let costUSD: number | null = null;
  for (const c of calls) {
    tokens.input += c.input;
    tokens.cacheRead += c.cacheRead;
    tokens.cacheWrite += c.cacheWrite;
    tokens.output += c.output;
    if (withReasoning) tokens.reasoning = (tokens.reasoning ?? 0) + c.reasoning;
    costUSD = addCost(costUSD, c.costUSD);
  }
  return { tokens, costUSD };
}

const sessionCount = (calls: Call[]) => new Set(calls.filter((c) => c.main).map((c) => c.session)).size;

function groupBy(calls: Call[], key: (c: Call) => string): Map<string, Call[]> {
  const m = new Map<string, Call[]>();
  for (const c of calls) {
    const k = key(c);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(c);
  }
  return m;
}

/** Aggregate one week's calls. `start` is the week's local Monday. Returns null for no calls ("no data", not zeros). */
export function aggregateWeek(calls: Call[], start: Date, withReasoning: boolean): ToolWeek | null {
  if (calls.length === 0) return null;
  const sorted = [...calls].sort((a, b) => a.ts.getTime() - b.ts.getTime());

  const perDay: DayStat[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const date = localDate(d);
    const day = sorted.filter((c) => localDate(c.ts) === date);
    perDay.push({ date, sessions: sessionCount(day), calls: day.length, ...totals(day, withReasoning), ...mix(day) });
  }

  // Sparse: only hours with calls.
  const perHour: HourStat[] = [...groupBy(sorted, (c) => `${isoDow(c.ts)}-${c.ts.getHours()}`)]
    .map(([k, hc]) => {
      const [dow, hour] = k.split("-").map(Number);
      const t = totals(hc, false);
      return { dow, hour, input: hc.reduce((n, c) => n + context(c), 0), output: t.tokens.output, costUSD: t.costUSD, ...mix(hc) };
    })
    .sort((a, b) => a.dow - b.dow || a.hour - b.hour);

  const sessions = [...groupBy(sorted, (c) => c.session).values()];
  const long = sessions.filter((s) => s.length > LONG_SESSION_CALLS).flat();
  const ctx = sorted.map(context).sort((a, b) => a - b);
  const starts = sessions.filter((s) => s[0].main).map((s) => context(s[0])).sort((a, b) => a - b);

  return {
    sessions: sessionCount(sorted),
    calls: sorted.length,
    ...totals(sorted, withReasoning),
    perDay,
    perHour,
    ...mix(sorted),
    context: {
      avgLongSession: long.length ? Math.round(long.reduce((n, c) => n + context(c), 0) / long.length) : 0,
      p95: ctx[Math.ceil(0.95 * ctx.length) - 1],
      peak: ctx[ctx.length - 1],
    },
    sessionStartMedian: starts.length ? starts[Math.floor((starts.length - 1) / 2)] : 0, // lower median
  };
}
