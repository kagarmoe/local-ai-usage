import { z } from "npm:zod@4";
import { calibrate, costCheck } from "./_lib/calibrate.ts";
import { parseClaude } from "./_lib/claude.ts";
import { loadPrices, type Prices, PricesSchema, priceCall, type Rate, RateSchema, savePrices } from "./_lib/prices.ts";
import { buildSnapshots, type Ctx, expandHome, scanFlow, statusFlow, storedWeeks } from "./_lib/scan.ts";
import { completedWeeks } from "./_lib/week.ts";

const Weekly = z.looseObject({ tool: z.literal("claudeCode"), week: z.string(), start: z.string(), complete: z.boolean() });
const Status = z.looseObject({ configured: z.boolean(), dir: z.string(), hint: z.string().nullable() });
const Calibration = z.object({ claude: z.record(z.string(), RateSchema), fittedAt: z.string() });
const ScanArgs = { prices: PricesSchema.optional().describe("prices.yaml as data; required when the step runs on a worker") };

/**
 * Rates come from `given` (a worker run, where repoDir is no checkout) or from prices.yaml (a local run).
 * Newly fitted rates collect in `added`; a local run also saves them to prices.yaml, as before.
 */
function build(ctx: Ctx, given: Prices | undefined, added: Record<string, Rate>) {
  return (files: string[], weeks: string[], oldest: Date, now: Date) => {
    const pricesPath = `${ctx.repoDir}/${ctx.globalArgs.pricesFile}`;
    const prices = given ?? loadPrices(pricesPath);
    const { calls, costStates, skipped } = parseClaude(files, expandHome(ctx.globalArgs.projectsDir));
    const rates = calibrate(costStates, prices.claude);
    for (const [m, r] of Object.entries(rates)) if (!prices.claude[m]) added[m] = r;
    if (Object.keys(added).length && !given) {
      savePrices(pricesPath, { ...prices, claude: rates });
      ctx.logger.info("Added Claude model rates to {file}", { file: pricesPath });
    }
    for (const c of calls) c.costUSD = priceCall(rates, c);
    return buildSnapshots({
      tool: "claudeCode", weeks, calls, oldest, now, skipped,
      extras: (_week, start, end) => ({
        costCheck: costCheck(costStates.filter((s) => s.startTime >= start.getTime() && s.startTime < end.getTime()), rates),
      }),
    });
  };
}

/** Scan, then record any newly fitted rates as `calibration` for the prices model to merge into prices.yaml. */
async function scanAndCalibrate(ctx: Ctx, given: Prices | undefined, pickWeeks: Parameters<typeof scanFlow>[2]) {
  const added: Record<string, Rate> = {};
  const r = await scanFlow(ctx, ctx.globalArgs.projectsDir, pickWeeks, build(ctx, given, added));
  if (!Object.keys(added).length) return r;
  ctx.logger.info("Fitted rates for {models}", { models: Object.keys(added).sort().join(", ") });
  const handle = await ctx.writeResource("calibration", "calibration", { claude: added, fittedAt: new Date().toISOString() });
  return { dataHandles: [...r.dataHandles, handle] };
}

export const model = {
  type: "@kagarmoe/local-ai-usage/claude-code",
  version: "2026.10.09.1",
  globalArguments: z.object({
    projectsDir: z.string().default("~/.claude/projects"),
    pricesFile: z.string().default("prices.yaml"),
  }),
  resources: {
    weekly: { description: "One ISO week of Claude Code usage", schema: Weekly, lifetime: "infinite", garbageCollection: 3 },
    status: { description: "Configuration check", schema: Status, lifetime: "infinite", garbageCollection: 1 },
    calibration: {
      description: "Rates fitted for Claude models that prices had no rate for; the prices model merges them",
      schema: Calibration,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    scanMissing: {
      description: "Scan every completed week that has no snapshot",
      arguments: z.object(ScanArgs),
      execute: async (args: { prices?: Prices }, ctx: Ctx) => {
        const stored = await storedWeeks(ctx);
        return scanAndCalibrate(ctx, args.prices, (o, n) => completedWeeks(o, n).filter((w) => !stored.has(w)));
      },
    },
    scan: {
      description: "Re-scan one ISO week; writes a new version",
      arguments: z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/), ...ScanArgs }),
      execute: (args: { week: string; prices?: Prices }, ctx: Ctx) => scanAndCalibrate(ctx, args.prices, () => [args.week]),
    },
    status: {
      description: "Report whether transcripts and prices are configured",
      arguments: z.object({}),
      execute: (_args: Record<string, never>, ctx: Ctx) =>
        statusFlow(ctx, ctx.globalArgs.projectsDir, Object.keys(loadPrices(`${ctx.repoDir}/${ctx.globalArgs.pricesFile}`).claude)),
    },
  },
};
