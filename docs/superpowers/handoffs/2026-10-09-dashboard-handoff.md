# Handoff — local-ai-usage dashboard (sub-project 2), 2026-10-09

Spec: `docs/superpowers/specs/2026-10-09-dashboard-design.md` (branch `dashboard`, worktree
`.claude/worktrees/dashboard`). Read it first; its Status notes record what has run.
Swamp notes: `~/obsidian/Resources/swamp/` (`swamp.md` index, `swamp-practice.md`,
`swamp-currency.md`). Load the `swamp` skill before any swamp work.

## Done

- Spec rewritten for the Blob design: render data → upload with `vercel blob put` → git-linked
  Vite site reads `/data/*` through a rewrite. Commits on `dashboard`: `379eab0`, `429d23c`,
  `e756915`, `157cbf4`, `ecdde0d`, plus this handoff. Nothing pushed.
- Vercel Blob store `ai-usage` = `store_blBRxMbrxzEnI88l` (public, `iad1`), created by swamp
  definition `dashboard-blob` (`@swamp/vercel/blob-storage/blob` 2026.10.01.1).
- Vercel project `ai-usage` = `prj_EgYL9x4XYklFy2fVnxD9jhQJmSDH`, created by `dashboard-project`.
  It is git-linked to `kagarmoe/local-ai-usage` (production branch `main`), uses Vite on Node
  24.x, and has no deployments yet. Phase 1 config: no `rootDirectory`, and an ignore command
  `git diff --quiet HEAD^ HEAD -- site`.
- Vault `secrets` (main checkout): `vercel-token` works (`GET /v2/user` → 200).
- The audit hook is enabled in local-ai-usage (`.claude/settings.local.json`, gitignored). The
  original `repoId` was kept.
- `rollbackOnFailure` works on the TypeScript method; the definition-YAML form is ignored.
  This is recorded in `swamp-currency.md`. No Lab issue exists; it is not filed.

## Blocked on the user

1. **`blob-rw-token` holds the store ID, not the token.** The stored value is
   `store_blBRxMbrxzEnI88l` (22 chars), and Vercel answers "Access denied". In Vercel, open
   Storage → `ai-usage` → `.env.local` tab → Show secret. Copy the value of
   `BLOB_READ_WRITE_TOKEN`, which starts with `vercel_blob_rw_` and is ~60 chars. Then run
   `cd ~/repos/local-ai-usage && swamp vault put secrets blob-rw-token -f`, which prompts for the
   value. To check it:
   `BLOB_READ_WRITE_TOKEN=… vercel blob list --non-interactive` should exit 0 with an empty list.
2. **Spec review.** The spec is not yet approved. After approval: invoke
   `superpowers:writing-plans`.

## Next (in order)

1. **Spike, rest of rollout step 1:** from the **main checkout**, with the token in env only:
   - `vercel blob put` a test file to `data/_probe.txt` with
     `--access public --allow-overwrite true --add-random-suffix false --cache-control-max-age 3600`;
   - put it again, to confirm it overwrites with no suffix;
   - fetch the public URL. This confirms the host, expected to be
     `blbrxmbrxzeni88l.public.blob.vercel-storage.com`;
   - `vercel blob del` the probe;
   - record the host in the spec, for the `site/vercel.json` rewrite.
2. Write the plan (`docs/superpowers/plans/`), then build `dashboard-data`, `blob-upload`, `site/`
   and the workflow steps, test-first with `deno task test`.
3. When `site/` lands: set `dashboard-project` `rootDirectory: site` and
   `commandForIgnoringBuildStep: git diff --quiet HEAD^ HEAD -- .`, then run
   `swamp model method run dashboard-project update`.
4. Domain: add a `dashboard-domain` (`@swamp/vercel/projects/domains`, project ID via CEL,
   `ai-usage.kimberlygarmoe.com`). This needs the user's OK. DNS is already on Vercel
   nameservers.
5. Write the `dashboard-setup` workflow (blob, project, domain), with guards. The domain step
   depends on the project step with `or(succeeded, skipped)`.

## Gotchas

- **Run swamp from the main checkout** (`~/repos/local-ai-usage`). The worktree has its own
  empty `.swamp/`, so its vault has no tokens. Do not copy secrets.
- The main checkout holds **identical uncommitted copies** of
  `extensions/models/upstream_extensions.json` and `models/@swamp/vercel/{blob-storage,projects}/`.
  These are committed on `dashboard`. Right before merging, discard them:
  `git checkout -- extensions/models/upstream_extensions.json && rm -r models/@swamp`. The daily
  publish commits only its own paths, so they are safe until then.
- Never push to or merge into `main` yourself; the daily job pushes `main`. Never push tag
  `pre-public-history`. Pushing `dashboard`, deploys, and the domain all need the user's OK.
- `@swamp/vercel/projects` warns that `creator.via` is null and doesn't match its schema.
  This is harmless.
- The `generatedAt` in `meta.json` changes every run, so the upload hash leaves it out
  (see spec).
- Tomorrow's 09:17 data push is the first real test of the ignore command. Check the project's
  deployments; expect "Canceled by Ignored Build Step" or none.
- Open beads: `localai-mdf` (full dashboard after v1), `localai-jao` (swamp serve via Tailscale).
  The beads↔GitHub sync offer is still pending.
