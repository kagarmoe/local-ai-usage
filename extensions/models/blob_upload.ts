import { z } from "npm:zod@4";
import type { Ctx } from "./_lib/scan.ts";
import { blobPut } from "./_lib/blob_upload.ts";
import type { DataFile } from "./_lib/dashboard_data.ts";

const File = z.object({ pathname: z.string(), content: z.string() });

export const model = {
  type: "@kagarmoe/local-ai-usage/blob-upload",
  version: "2026.10.09.1",
  globalArguments: z.object({ token: z.string().meta({ sensitive: true }) }),
  resources: {
    upload: {
      description: "Hash and pathnames of the last successful upload",
      schema: z.object({ hash: z.string(), pathnames: z.array(z.string()), uploadedAt: z.string() }),
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    put: {
      description: "Upload files to the Blob store connected to the linked Vercel project",
      arguments: z.object({ files: z.array(File).min(1), hash: z.string() }),
      execute: async (args: { files: DataFile[]; hash: string }, ctx: Ctx) => {
        blobPut(ctx.repoDir, args.files, ctx.globalArgs.token);
        // Written only after every upload succeeded, so a failed run records no hash and the next run retries.
        const r = { hash: args.hash, pathnames: args.files.map((f) => f.pathname), uploadedAt: new Date().toISOString() };
        ctx.logger.info("Uploaded {pathnames}", r);
        return { dataHandles: [await ctx.writeResource("upload", "upload", r)] };
      },
    },
  },
};
