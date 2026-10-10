import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import { publish } from "./publish.ts";

const env = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.com", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.com" };
const git = (cwd: string, ...args: string[]): string => {
  const r = new Deno.Command("git", { args: ["-c", "commit.gpgsign=false", ...args], cwd, env }).outputSync();
  if (!r.success) throw new Error(`git ${args.join(" ")}: ${new TextDecoder().decode(r.stderr)}`);
  return new TextDecoder().decode(r.stdout).trim();
};
const PATHS = ["public/summary.json", "prices.yaml"];

// A repo with one commit and a bare origin that has not received it.
function fixture(): { dir: string; origin: string } {
  const dir = Deno.makeTempDirSync(), origin = Deno.makeTempDirSync();
  git(origin, "init", "-q", "--bare", "-b", "main");
  git(dir, "init", "-q", "-b", "main");
  Deno.mkdirSync(`${dir}/public`);
  Deno.writeTextFileSync(`${dir}/public/summary.json`, `{"weeks":[{"week":"2026-W40"}]}\n`);
  Deno.writeTextFileSync(`${dir}/prices.yaml`, "claude: {}\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "weekly summary");
  git(dir, "remote", "add", "origin", origin);
  return { dir, origin };
}
const originHead = (origin: string) => git(origin, "for-each-ref", "--format=%(objectname)", "refs/heads/main");

Deno.test("publish pushes a commit an earlier run failed to push, even when nothing new changed", () => {
  const { dir, origin } = fixture();
  const r = publish(dir, PATHS, env);
  assertEquals([r.committed, r.pushed], [false, true]);
  assertEquals(originHead(origin), git(dir, "rev-parse", "HEAD"));
});

Deno.test("publish commits a changed summary with its newest week in the message, then pushes", () => {
  const { dir, origin } = fixture();
  Deno.writeTextFileSync(`${dir}/public/summary.json`, `{"weeks":[{"week":"2026-W41"},{"week":"2026-W40"}]}\n`);
  Deno.writeTextFileSync(`${dir}/unrelated.txt`, "not published\n");
  const r = publish(dir, PATHS, env);
  assertEquals([r.committed, r.pushed, r.week], [true, true, "2026-W41"]);
  assertEquals(git(dir, "log", "-1", "--format=%s"), "chore(data): weekly summary 2026-W41");
  assertEquals(git(dir, "status", "--porcelain"), "?? unrelated.txt");
  assertEquals(originHead(origin), r.sha);
});

Deno.test("publish refuses to run off main", () => {
  const { dir } = fixture();
  git(dir, "switch", "-qc", "feature");
  assertThrows(() => publish(dir, PATHS, env), Error, "not on main");
});
