// Commit the published files when they changed, then push main if an origin exists.
export type PublishResult = { committed: boolean; pushed: boolean; sha: string; week: string | null };

export function publish(repoDir: string, paths: string[], env?: Record<string, string>): PublishResult {
  const git = (...args: string[]) => {
    const r = new Deno.Command("git", { args, cwd: repoDir, env }).outputSync();
    return { ok: r.success, out: new TextDecoder().decode(r.stdout).trim(), err: new TextDecoder().decode(r.stderr).trim() };
  };
  const must = (...args: string[]) => {
    const r = git(...args);
    if (!r.ok) throw new Error(`git ${args[0]} failed: ${r.err}`);
    return r.out;
  };

  if (must("rev-parse", "--abbrev-ref", "HEAD") !== "main") throw new Error("not on main; refusing to publish");
  must("add", "--", ...paths);
  const changed = !git("diff", "--cached", "--quiet", "--", ...paths).ok;
  let week: string | null = null;
  if (changed) {
    week = JSON.parse(Deno.readTextFileSync(`${repoDir}/public/summary.json`)).weeks?.[0]?.week ?? null;
    must("commit", "-q", "-m", `chore(data): weekly summary ${week}`, "--", ...paths);
  }
  // Push even with no change, so a commit whose push failed on an earlier run goes out now.
  const hasOrigin = git("remote", "get-url", "origin").ok;
  if (hasOrigin) must("push", "-q", "origin", "main");
  return { committed: changed, pushed: hasOrigin, sha: must("rev-parse", "HEAD"), week };
}
