import { assertEquals } from "jsr:@std/assert@1.0.19";

const env = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
function run(cmd: string, cwd: string, ...args: string[]): string {
  const r = new Deno.Command(cmd, { args, cwd, env }).outputSync();
  if (!r.success) throw new Error(`${cmd} ${args.join(" ")}: ${new TextDecoder().decode(r.stderr)}`);
  return new TextDecoder().decode(r.stdout).trim();
}
const git = (cwd: string, ...args: string[]) => run("git", cwd, "-c", "commit.gpgsign=false", ...args);

Deno.test("publish.sh pushes a commit an earlier run failed to push, even when nothing new changed", () => {
  const dir = Deno.makeTempDirSync(), origin = Deno.makeTempDirSync();
  git(origin, "init", "-q", "--bare", "-b", "main");
  git(dir, "init", "-q", "-b", "main");
  Deno.mkdirSync(`${dir}/scripts`);
  Deno.mkdirSync(`${dir}/public`);
  Deno.copyFileSync(new URL("./publish.sh", import.meta.url).pathname, `${dir}/scripts/publish.sh`);
  Deno.writeTextFileSync(`${dir}/public/summary.json`, "{}\n");
  Deno.writeTextFileSync(`${dir}/prices.yaml`, "claude: {}\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "weekly summary"); // committed by an earlier run whose push failed
  git(dir, "remote", "add", "origin", origin);
  run("sh", dir, "scripts/publish.sh");
  assertEquals(git(origin, "for-each-ref", "--format=%(objectname)", "refs/heads/main"), git(dir, "rev-parse", "HEAD"));
});
