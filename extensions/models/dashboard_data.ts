import { z } from "npm:zod@4";
import type { Ctx } from "./_lib/scan.ts";
import { render } from "./_lib/dashboard_data.ts";

const File = z.object({ pathname: z.string(), content: z.string() });

export const model = {
  type: "@kagarmoe/local-ai-usage/dashboard-data",
  version: "2026.10.09.1",
  globalArguments: z.object({ public: z.unknown() }),
  resources: {
    data: {
      description: "The dashboard's data files (data/weeks.jsonl, data/meta.json) and their hash, generatedAt excluded",
      schema: z.object({ hash: z.string(), files: z.array(File) }),
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    render: {
      description: "Render the public summary into the dashboard's data files",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, ctx: Ctx) => {
        // One write, after all fallible work: a failed render records nothing.
        const data = await render(ctx.globalArgs.public);
        ctx.logger.info("Rendered {files} files, hash {hash}", { files: data.files.length, hash: data.hash });
        return { dataHandles: [await ctx.writeResource("data", "data", data)] };
      },
    },
  },
};
