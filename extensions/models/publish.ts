import { z } from "npm:zod@4";
import type { Ctx } from "./_lib/scan.ts";
import { publish } from "./_lib/publish.ts";

export const model = {
  type: "@kagarmoe/local-ai-usage/publish",
  version: "2026.10.09.1",
  globalArguments: z.object({
    paths: z.array(z.string()).default(["public/summary.json", "prices.yaml"]),
  }),
  resources: {
    publish: {
      description: "Outcome of the last publish: whether it committed and pushed, and the resulting HEAD",
      schema: z.object({ committed: z.boolean(), pushed: z.boolean(), sha: z.string(), week: z.string().nullable() }),
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    publish: {
      description: "Commit the published files on main when they changed, then push to origin",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, ctx: Ctx) => {
        const r = publish(ctx.repoDir, ctx.globalArgs.paths as string[]);
        ctx.logger.info("committed={committed} pushed={pushed} sha={sha}", r);
        return { dataHandles: [await ctx.writeResource("publish", "publish", r)] };
      },
    },
  },
};
