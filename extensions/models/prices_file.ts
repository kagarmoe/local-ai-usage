import { z } from "npm:zod@4";
import { addRates, loadPrices, type Prices, PricesSchema, type Rate, savePrices } from "./_lib/prices.ts";
import type { Ctx } from "./_lib/scan.ts";

/**
 * prices.yaml on the orchestrator's checkout, as data. `load` hands it to scans that run on a worker; `merge` writes
 * back the rates those scans fitted (their `calibration` resource), so prices.yaml stays the reviewed source of truth.
 */
export const model = {
  type: "@kagarmoe/local-ai-usage/prices",
  version: "2026.10.16.1",
  globalArguments: z.object({
    pricesFile: z.string().default("prices.yaml"),
    calibrationSources: z.array(z.string()).default(["claude-code"]),
  }),
  resources: {
    prices: {
      description: "prices.yaml as last loaded or merged",
      schema: PricesSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    load: {
      description: "Read prices.yaml into data",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, ctx: Ctx) => {
        const prices = loadPrices(`${ctx.repoDir}/${ctx.globalArgs.pricesFile}`);
        return { dataHandles: [await ctx.writeResource("prices", "prices", prices)] };
      },
    },
    merge: {
      description: "Add fitted rates from the calibration sources to prices.yaml for models it lacks, then reload",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, ctx: Ctx) => {
        const path = `${ctx.repoDir}/${ctx.globalArgs.pricesFile}`;
        const fitted: Record<string, Rate> = {};
        for (const name of ctx.globalArgs.calibrationSources as string[]) {
          const rows = await ctx.queryData(`modelName == "${name}" && specName == "calibration"`, "content");
          for (const r of rows) Object.assign(fitted, ((typeof r === "string" ? JSON.parse(r) : r) as { claude: Record<string, Rate> }).claude);
        }
        const { prices, models } = addRates(loadPrices(path), fitted);
        if (models.length) {
          savePrices(path, prices);
          ctx.logger.info("Added Claude model rates to {file}: {models}", { file: path, models: models.join(", ") });
        }
        return { dataHandles: [await ctx.writeResource("prices", "prices", prices satisfies Prices)] };
      },
    },
  },
};
