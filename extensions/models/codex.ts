import { z } from "npm:zod@4";
import { parseCodex } from "./_lib/codex.ts";
import { loadPrices, type Prices, PricesSchema, priceCall } from "./_lib/prices.ts";
import { buildSnapshots, type Ctx, scanFlow, statusFlow, storedWeeks } from "./_lib/scan.ts";
import { completedWeeks } from "./_lib/week.ts";

const Weekly = z.looseObject({ tool: z.literal("codex"), week: z.string(), start: z.string(), complete: z.boolean() });
const Status = z.looseObject({ configured: z.boolean(), dir: z.string(), hint: z.string().nullable() });
const ScanArgs = { prices: PricesSchema.optional().describe("prices.yaml as data; required when the step runs on a worker") };

const peak = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
};

/** Rates come from `given` (a worker run, where repoDir is no checkout) or from prices.yaml (a local run). */
function build(ctx: Ctx, given: Prices | undefined) {
  return (files: string[], weeks: string[], oldest: Date, now: Date) => {
    const priceTable = (given ?? loadPrices(`${ctx.repoDir}/${ctx.globalArgs.pricesFile}`)).codex;
    const { calls, rates, skipped } = parseCodex(files);
    for (const c of calls) c.costUSD = priceCall(priceTable, c);
    return buildSnapshots({
      tool: "codex", weeks, calls, oldest, now, skipped,
      extras: (_week, start, end) => {
        const inWeek = rates.filter((r) => r.ts >= start && r.ts < end);
        return { rateLimits: { fiveHourPeakPct: peak(inWeek.map((r) => r.fiveHour)), weeklyPeakPct: peak(inWeek.map((r) => r.weekly)) } };
      },
    });
  };
}

export const model = {
  type: "@kagarmoe/local-ai-usage/codex",
  version: "2026.10.09.1",
  globalArguments: z.object({
    sessionsDir: z.string().default("~/.codex/sessions"),
    pricesFile: z.string().default("prices.yaml"),
  }),
  resources: {
    weekly: { description: "One ISO week of Codex usage", schema: Weekly, lifetime: "infinite", garbageCollection: 3 },
    status: { description: "Configuration check", schema: Status, lifetime: "infinite", garbageCollection: 1 },
  },
  methods: {
    scanMissing: {
      description: "Scan every completed week that has no snapshot",
      arguments: z.object(ScanArgs),
      execute: async (args: { prices?: Prices }, ctx: Ctx) => {
        const stored = await storedWeeks(ctx);
        return scanFlow(ctx, ctx.globalArgs.sessionsDir, (o, n) => completedWeeks(o, n).filter((w) => !stored.has(w)), build(ctx, args.prices));
      },
    },
    scan: {
      description: "Re-scan one ISO week; writes a new version",
      arguments: z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/), ...ScanArgs }),
      execute: (args: { week: string; prices?: Prices }, ctx: Ctx) =>
        scanFlow(ctx, ctx.globalArgs.sessionsDir, () => [args.week], build(ctx, args.prices)),
    },
    status: {
      description: "Report whether session logs and prices are configured",
      arguments: z.object({}),
      execute: (_args: Record<string, never>, ctx: Ctx) =>
        statusFlow(ctx, ctx.globalArgs.sessionsDir, Object.keys(loadPrices(`${ctx.repoDir}/${ctx.globalArgs.pricesFile}`).codex)),
    },
  },
};
