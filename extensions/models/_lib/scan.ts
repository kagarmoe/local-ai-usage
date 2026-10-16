import { aggregateWeek, type Call, context, type ModelStat, type ToolWeek } from "./aggregate.ts";
import { listJsonl } from "./jsonl.ts";
import { isoWeek, localDate, weekBounds } from "./week.ts";

export type Tool = "claudeCode" | "codex";

export type WeeklySnapshot = {
  tool: Tool;
  week: string;
  start: string;
  complete: boolean;
  scannedAt: string;
  summary: ToolWeek | null;
  costCheck?: { sessions: number; deltaPct: number }; // claudeCode
  rateLimits?: { fiveHourPeakPct: number | null; weeklyPeakPct: number | null }; // codex
  /** Never published. */
  private: {
    skippedLines: number;
    unpricedModels: string[];
    projects: Record<string, ModelStat>;
    subagentModelsByProject: Record<string, Record<string, number>>; // calls
  };
};

/** The subset of swamp's method context these models use. */
export type Ctx = {
  globalArgs: any;
  definition: { name: string };
  repoDir: string;
  logger: { info: (msg: string, props?: Record<string, unknown>) => void };
  queryData: (predicate: string, select?: string) => Promise<unknown[]>;
  writeResource: (spec: string, name: string, data: unknown) => Promise<unknown>;
};

type LogFile = { path: string; born: Date; modified: Date };

export const expandHome = (p: string) => p.replace(/^~(?=\/|$)/, Deno.env.get("HOME") ?? "~");

/** Log files with the time of their oldest possible data (birth) and last write. */
export function logFiles(dir: string): LogFile[] {
  return listJsonl(dir).map((path) => {
    const s = Deno.statSync(path);
    const modified = s.mtime ?? new Date();
    const born = s.birthtime && s.birthtime < modified ? s.birthtime : modified;
    return { path, born, modified };
  });
}

function privateDetail(calls: Call[], skippedLines: number): WeeklySnapshot["private"] {
  const projects: Record<string, ModelStat> = {};
  const subagentModelsByProject: Record<string, Record<string, number>> = {};
  const unpriced = new Set<string>();
  for (const c of calls) {
    const p = (projects[c.project] ??= { calls: 0, input: 0, output: 0, costUSD: null });
    p.calls++;
    p.input += context(c);
    p.output += c.output;
    if (c.costUSD === null) unpriced.add(c.model);
    else p.costUSD = (p.costUSD ?? 0) + c.costUSD;
    if (!c.main) {
      const s = (subagentModelsByProject[c.project] ??= {});
      s[c.model] = (s[c.model] ?? 0) + 1;
    }
  }
  return { skippedLines, unpricedModels: [...unpriced].sort(), projects, subagentModelsByProject };
}

/** One snapshot per week from priced calls. Calls outside `weeks` are ignored. */
export function buildSnapshots(o: {
  tool: Tool;
  weeks: string[];
  calls: Call[];
  oldest: Date;
  now: Date;
  skipped: number;
  extras?: (week: string, start: Date, end: Date) => Partial<Pick<WeeklySnapshot, "costCheck" | "rateLimits">>;
}): WeeklySnapshot[] {
  const byWeek = new Map<string, Call[]>(o.weeks.map((w) => [w, []]));
  for (const c of o.calls) byWeek.get(isoWeek(c.ts))?.push(c);
  return o.weeks.map((week) => {
    const { start, end } = weekBounds(week);
    const calls = byWeek.get(week)!;
    return {
      tool: o.tool,
      week,
      start: localDate(start),
      complete: start.getTime() >= o.oldest.getTime(),
      scannedAt: o.now.toISOString(),
      summary: aggregateWeek(calls, start, o.tool === "codex"),
      ...o.extras?.(week, start, end),
      private: privateDetail(calls, o.skipped),
    };
  });
}

/** Weeks that already have a snapshot for this model. No select projection: swamp refuses them from workers. */
export async function storedWeeks(ctx: Ctx): Promise<Set<string>> {
  const rows = await ctx.queryData(`modelName == "${ctx.definition.name}" && specName == "weekly"`);
  return new Set(rows.map((r) => String((r as { name: string }).name).replace(/^weekly-/, "")));
}

/** Shared scan: pick weeks, parse only files written since the earliest one, write a `weekly` resource per week. */
export async function scanFlow(
  ctx: Ctx,
  dir: string,
  pickWeeks: (oldest: Date, now: Date) => string[],
  build: (files: string[], weeks: string[], oldest: Date, now: Date) => WeeklySnapshot[],
) {
  const abs = expandHome(dir);
  let files: LogFile[];
  try {
    files = logFiles(abs);
  } catch {
    throw new Error(`Log directory not found: ${abs}. Run the status method for a setup hint.`);
  }
  if (!files.length) {
    ctx.logger.info("No log files in {dir}", { dir: abs });
    return { dataHandles: [] };
  }
  const now = new Date();
  const oldest = new Date(Math.min(...files.map((f) => f.born.getTime())));
  const weeks = pickWeeks(oldest, now).sort();
  if (!weeks.length) {
    ctx.logger.info("No missing weeks");
    return { dataHandles: [] };
  }
  // Logs are append-only: a file last written before the earliest week cannot hold its calls.
  const from = weekBounds(weeks[0]).start;
  const paths = files.filter((f) => f.modified >= from).map((f) => f.path);
  const dataHandles = [];
  for (const s of build(paths, weeks, oldest, now)) dataHandles.push(await ctx.writeResource("weekly", `weekly-${s.week}`, s));
  ctx.logger.info("Wrote {n} weekly snapshots", { n: dataHandles.length });
  return { dataHandles };
}

/** Shared status: is the log directory configured, and which models have rates. */
export async function statusFlow(ctx: Ctx, dir: string, pricedModels: string[]) {
  const abs = expandHome(dir);
  let files: LogFile[] = [];
  try {
    files = logFiles(abs);
  } catch {
    // missing directory: reported as unconfigured below
  }
  const data = {
    configured: files.length > 0,
    dir: abs,
    files: files.length,
    oldest: files.length ? new Date(Math.min(...files.map((f) => f.born.getTime()))).toISOString() : null,
    pricedModels: [...pricedModels].sort(),
    hint: files.length ? null : `No .jsonl logs in ${abs}. Set this model's globalArguments to the tool's log directory.`,
  };
  return { dataHandles: [await ctx.writeResource("status", "status", data)] };
}
