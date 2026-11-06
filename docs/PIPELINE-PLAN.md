# Pipeline plan: trustworthy deploys

Agreed with the owner on 2026-11-06. One step at a time; each step is verified before the next starts. Tick a box only when its proof is recorded.

## Why
- The pipeline can fail silently: CI never runs, a deploy never lands, the wrong commit is live, telemetry stops. Push-based signals (CI traces, Render notifications) only report what ran, never what did not happen.
- Practice: prove inside the pipeline that the new commit is live (the job that ships goes red otherwise), plus one observer outside GitHub, Render and Dash0 that compares the wanted commit with the live one (the GitOps reconcile idea). Outside observer dropped 2026-11-06: see [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md), Open.
- Research behind this (two runs, each claim fact-checked): GitHub has no native OTLP export; Render's "After CI checks pass" deploys nothing, silently, when a commit has no or failing checks; any extra check on a commit becomes a Render deploy gate; GitHub scheduled workflows can run hours late.

## Steps
- [x] **1. Static sites publish only the game.** Today both publish the whole checkout (`publishPath ./`, Render's automatic `npm install` adds `node_modules`): server code, docs, CI and agent files are public. Build: `mkdir -p public && cp index.html public/ && printf %s "$RENDER_GIT_COMMIT" > public/version.txt`, publish `public`, env `SKIP_INSTALL_DEPS=true`. Dev first, then prod, before the next promotion. Proof: `/version.txt` shows the commit, `/server/index.js`, `/node_modules/…`, `/docs/…`, `/.claude/…` return 404, the game loads.
  - Dev done 2026-11-06: settings applied 12:13 UTC, deploy live in 9 s (no npm install); `/version.txt` = e6248b1; 8 repo paths 404 from 12:18 (old copies stayed in Cloudflare's cache up to 5 min, `s-maxage=300`); game loads with no errors.
  - Prod done 2026-11-06: settings applied 12:22 UTC, deploy of 8792a17 live in 11 s; `/version.txt` = 8792a17; served `index.html` identical to `main`'s; 8 repo paths 404 straight from the origin (cache MISS); game loads with no errors.
- [x] **2. GitHub Pro (owner buys it), then rulesets on `dev` and `main`.** Changes only via pull request; checks `test` and `game` required; branch up to date before merging; no bypass.
  - Done 2026-11-06: owner upgraded to Pro; ruleset 26693579 from `.github/rulesets/dev-main.json`. Proof: a direct push to `dev` was rejected (`GH013: Repository rule violations`, `dev` unchanged at e6248b1); `gh pr merge 45` with CI running was refused ("the base branch policy prohibits the merge", BLOCKED). Not tested: `--admin` (no bypass actors, so it should be refused; a success would have merged on unfinished CI).
- [x] **3. Deploy on commit, verify in CI.** Render `autoDeployTrigger` → `commit` on all four services (Render's advice once checks run before the branch). New CI job on pushes to `dev`/`main`: wait until the API `/health` and the site `/version.txt` show `GITHUB_SHA` (gives up after 15 min), else fail, so the owner gets GitHub's failure email. No deploy hooks: they add four secret URLs, and re-running an old run would redeploy an old commit.
  - 2026-11-06 12:47 UTC: all four services switched to "On commit" (before the `deployed` job reached `dev`: with "After CI checks pass" Render would wait for that job while it waits for Render). No deploy was triggered by the switch. Rollback: set `autoDeployTrigger` back to `checksPass`. `tools/verify-deploy.js` + 4 fast tests; run by hand against dev it reported "live: API and site serve e6248b1".
  - Done 2026-11-06: PR #45 merged into `dev` 12:58:21 UTC (merge commit d5f2fff); push run [42221746028](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/42221746028) `test`, `game`, `deployed` all green; `deployed` logged `live: API and site serve d5f2fff…` at 12:59:19 (58 s after the merge). Not yet seen: a red `deployed` run (its 4 fast tests cover it) and a run on `main` (first at the next promotion).
- [x] **4. Auto-merge.** Repository setting on; merges enabled by a person's token, never by `GITHUB_TOKEN` (its merges start no workflows).
  - Done 2026-11-06: repository setting `allow_auto_merge` on. PR #45: auto-merge enabled 12:49:41 UTC by `alexisdacquay` (merge commit method) while CI ran; GitHub merged it 12:58:21 once `test` and `game` passed on an up-to-date branch; the merge started the `dev` push run 3 s later (12:58:24), so a person's merge does start workflows.
- ~~**5. Outside observer: Checkly.**~~ Superseded 2026-11-06 by [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md): Better Stack checks that the game sites (and the production API once paid) are up; the `deployed` job (step 3) checks the commit.

## Findings
- Prod sends no telemetry, and Dash0 is a single point of failure: both superseded 2026-11-06 by [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md) (Sentry replaces Dash0; production joins at the next promotion).

## Checked and cleared
- Postgres expiry: the v4 database is on a paid plan (`basic_256mb`), not Free. Owner to decide on `immune-citadel-dev-db` and `immune-citadel-prod-db` (15 GB each, paid, created 2026-10-29), which look like v3 leftovers.
