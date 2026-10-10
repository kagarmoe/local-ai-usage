// Upload files to the Blob store connected to the linked Vercel project, with the Vercel CLI.
import type { DataFile } from "./dashboard_data.ts";

const TYPES: Record<string, string> = { json: "application/json", jsonl: "application/x-ndjson" };

export function blobPut(repoDir: string, files: DataFile[], token: string, bin = "vercel"): void {
  const tmp = Deno.makeTempDirSync({ prefix: "blob-upload-" });
  const run = (args: string[], cwd: string, env: Record<string, string>) => {
    const r = new Deno.Command(bin, { args, cwd, env }).outputSync();
    if (!r.success) throw new Error(`vercel ${args[0]} ${args[1]} failed: ${new TextDecoder().decode(r.stderr).trim()}`);
  };
  try {
    // An empty global config, so a CLI login can't stand in for the token.
    const pulled = `${tmp}/.env.pulled`, config = `${tmp}/config`;
    Deno.mkdirSync(config);
    run(["env", "pull", pulled, "--environment", "development", "--yes", "--global-config", config], repoDir, { VERCEL_TOKEN: token });
    const rw = Deno.readTextFileSync(pulled).match(/^BLOB_READ_WRITE_TOKEN="?([^"\n]+)"?$/m)?.[1];
    Deno.removeSync(pulled);
    // Without it the CLI falls back to any BLOB_READ_WRITE_TOKEN in the parent env, which may be another store's.
    if (!rw) throw new Error("vercel env pull returned no BLOB_READ_WRITE_TOKEN; is the Blob store connected to the project?");
    for (const f of files) {
      const local = `${tmp}/${f.pathname.replaceAll("/", "_")}`;
      Deno.writeTextFileSync(local, f.content);
      // cwd is tmp, not the repo: a .env.local there with VERCEL_OIDC_TOKEN makes the CLI refuse to run.
      run(["blob", "put", local, "--pathname", f.pathname, "--access", "public", "--allow-overwrite",
        "--cache-control-max-age", "3600", "--content-type", TYPES[f.pathname.split(".").pop()!] ?? "text/plain"], tmp, { BLOB_READ_WRITE_TOKEN: rw });
    }
  } finally {
    Deno.removeSync(tmp, { recursive: true });
  }
}
