import { z } from "npm:zod@4";
import { calibrate, costCheck } from "./_lib/calibrate.ts";
import { parseClaude } from "./_lib/claude.ts";
import { loadPrices, priceCall, savePrices } from "./_lib/prices.ts";
import { buildSnapshots, type Ctx, expandHome, scanFlow, statusFlow, storedWeeks } from "./_lib/scan.ts";
import { completedWeeks } from "./_lib/week.ts";

const Weekly = z.looseObject({ tool: z.literal("claudeCode"), week: z.string(), start: z.string(), complete: z.boolean() });
const Status = z.looseObject({ configured: z.boolean(), dir: z.string(), hint: z.string().nullable() });

function build(ctx: Ctx) {
  return (files: string[], weeks: string[], oldest: Date, now: Date) => {
    const pricesPath = `${ctx.repoDir}/${ctx.globalArgs.pricesFile}`;
    const prices = loadPrices(pricesPath);
    const { calls, costStates, skipped } = parseClaude(files, expandHome(ctx.globalArgs.projectsDir));
    const rates = calibrate(costStates, prices.claude);
    if (Object.keys(rates).length > Object.keys(prices.claude).length) {
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
  },
  methods: {
    scanMissing: {
      description: "Scan every completed week that has no snapshot",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, ctx: Ctx) => {
        const stored = await storedWeeks(ctx);
        return scanFlow(ctx, ctx.globalArgs.projectsDir, (o, n) => completedWeeks(o, n).filter((w) => !stored.has(w)), build(ctx));
      },
    },
    scan: {
      description: "Re-scan one ISO week; writes a new version",
      arguments: z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/) }),
      execute: (args: { week: string }, ctx: Ctx) => scanFlow(ctx, ctx.globalArgs.projectsDir, () => [args.week], build(ctx)),
    },
    status: {
      description: "Report whether transcripts and prices are configured",
      arguments: z.object({}),
      execute: (_args: Record<string, never>, ctx: Ctx) =>
        statusFlow(ctx, ctx.globalArgs.projectsDir, Object.keys(loadPrices(`${ctx.repoDir}/${ctx.globalArgs.pricesFile}`).claude)),
    },
  },
};
