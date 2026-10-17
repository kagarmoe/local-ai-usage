import { parse } from "jsr:@std/yaml@1.3.0";
import { z } from "npm:zod@4";
import type { Ctx, WeeklySnapshot } from "./_lib/scan.ts";
import { buildSummary, renderMarkdown } from "./_lib/summary.ts";

// events.yaml is hand-edited: validate it at the boundary.
const Events = z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), label: z.string().min(1) }));

export const model = {
  type: "@kagarmoe/local-ai-usage/summary",
  version: "2026.10.17.1",
  globalArguments: z.object({
    sources: z.array(z.string()).default(["claude-code", "codex"]),
    eventsFile: z.string().default("events.yaml"),
  }),
  resources: {
    summary: {
      description: "Public summary and private markdown",
      schema: z.looseObject({ public: z.unknown(), markdown: z.string() }),
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    build: {
      description: "Build the public summary and the private markdown from the latest snapshot of every week (swamp data only; nothing is written to the repo)",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, ctx: Ctx) => {
        const snaps: WeeklySnapshot[] = [];
        for (const name of ctx.globalArgs.sources as string[]) {
          const rows = await ctx.queryData(`modelName == "${name}" && specName == "weekly"`, "content");
          snaps.push(...rows.map((r) => (typeof r === "string" ? JSON.parse(r) : r) as WeeklySnapshot));
        }
        const events = Events.parse(parse(Deno.readTextFileSync(`${ctx.repoDir}/${ctx.globalArgs.eventsFile}`)) ?? []);
        const pub = buildSummary(snaps, events);
        ctx.logger.info("Built {weeks} weeks", { weeks: pub.weeks.length });
        return { dataHandles: [await ctx.writeResource("summary", "summary", { public: pub, markdown: renderMarkdown(snaps) })] };
      },
    },
  },
};
