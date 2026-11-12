# Pipeline plan: trustworthy deploys

*Who this page is for: a build record of how the deploy pipeline was set up, step by step, with its proof. How it works today: [OPERATIONS.md](OPERATIONS.md#releases). The pull requests and Actions runs it describes are in the project's original repository; issue numbers are this repository's.*

**Status: closed.** Steps 1 to 4 were done and proven on 2026-11-06; step 5 moved to [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md). The deploy proof first ran on production at the 2026-11-07 promotion. How the pipeline works today: [OPERATIONS.md, Releases](OPERATIONS.md#releases).

Agreed with the owner on 2026-11-06. One step at a time, each verified before the next started; a step is marked done only when its proof is recorded here.

## Why

- A pipeline can fail silently: CI never runs, a deploy never lands, the wrong commit is live, telemetry stops. Push-based signals (CI traces, Render notifications) report only what ran, never what did not happen.
- The practice: prove inside the pipeline that the new commit is live (the job that ships goes red otherwise), plus one observer outside GitHub and Render that compares the wanted commit with the live one (the GitOps reconcile idea). The outside observer was dropped on 2026-11-06: see [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md#open).
- Research behind this (two runs, each claim fact-checked): GitHub has no native OTLP export; Render's "After CI checks pass" trigger silently deploys nothing when a commit has no checks or failing ones; any extra check on a commit becomes a Render deploy gate; GitHub's scheduled workflows can run hours late.

## Steps at a glance

| # | Step | Status | Proof |
|---|---|---|---|
| 1 | Game sites publish only the game | done 2026-11-06 | `/version.txt` shows the commit; 8 repository paths return 404 on dev and production |
| 2 | Rulesets on `dev` and `main` | done 2026-11-06, changed 2026-11-07 | a direct push to `dev` rejected (`GH013`); a merge with CI running refused |
| 3 | Deploy on commit, verified in CI | done 2026-11-06 | dev: `deployed` saw the merge live after 58 s; production: after 73 s (2026-11-07) |
| 4 | Auto-merge | done 2026-11-06 | the pipeline pull request merged by GitHub once CI passed; the merge started the `dev` push run |
| 5 | Outside observer (Checkly) | superseded 2026-11-06 | Better Stack and the `deployed` job instead ([OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md)) |

**Not yet seen:** a red `deployed` run in real CI. Its 4 fast tests ([test/verify-deploy.test.js](../test/verify-deploy.test.js)) cover the failure path.

## Steps in detail

### 1. Game sites publish only the game: done

Before, both sites published the whole checkout (`publishPath ./`, and Render's automatic `npm install` added `node_modules`): server code, docs, CI and agent files were public. The build became (2026-11-06) `mkdir -p public && cp index.html public/ && printf %s "$RENDER_GIT_COMMIT" > public/version.txt`, publishing `public`, with `SKIP_INSTALL_DEPS=true`. Today's build, which also publishes the fonts: [OPERATIONS, What runs on Render](OPERATIONS.md#what-runs-on-render).

Required proof: `/version.txt` shows the commit; `/server/index.js`, `/node_modules/…`, `/docs/…` and `/.claude/…` return 404; the game loads.

- **Dev, 2026-11-06:** settings applied 12:13 UTC; deploy live in 9 s (no npm install); `/version.txt` = `e6248b1`; 8 repository paths return 404 from 12:18 (old copies stayed in Cloudflare's cache for up to 5 min, `s-maxage=300`); the game loads with no errors.
- **Production, 2026-11-06:** settings applied 12:22 UTC; deploy of `8792a17` live in 11 s; `/version.txt` = `8792a17`; the served `index.html` identical to `main`'s; 8 repository paths return 404 straight from the origin (cache MISS); the game loads with no errors.

### 2. Rulesets on `dev` and `main`: done

GitHub Pro bought by the owner (the repository was private then; it is public now). Changes only through a pull request, nobody bypasses. Today's rules are in [OPERATIONS.md, Branch rules](OPERATIONS.md#branch-rules).

- **Done 2026-11-06:** one ruleset for both branches (26693579, from `dev-main.json`). A direct push to `dev` was rejected (`GH013: Repository rule violations`; `dev` stayed at `e6248b1`); `gh pr merge` on a pull request with CI still running was refused ("the base branch policy prohibits the merge", BLOCKED). Not tested: `--admin`. There are no bypass actors, so it should be refused.
- **2026-11-07, three changes:** `qa` became a required check on `dev` (issue #34); `dev` no longer requires an up-to-date branch and `main` requires `dev-green` (issue #35); `dev-green` moved into its own workflow that runs only on promotions (issue #38). Two rulesets since: `dev` and `main`, from [.github/rulesets/](../.github/rulesets/), then 26753396 and 26693579; created again from the same files on 2026-11-12 as 27124769 (`dev`) and 27124774 (`main`).

### 3. Deploy on commit, verified in CI: done

Render's `autoDeployTrigger` is `commit` on all four services (Render's advice once checks run before the branch). A CI job on pushes to `dev` and `main`, `deployed`, waits until the API's `/health` and the site's `/version.txt` show `GITHUB_SHA`, and fails after 15 min otherwise, so the owner gets GitHub's failure email. No deploy hooks: they would add four secret URLs, and re-running an old CI run would redeploy an old commit.

- **2026-11-06 12:47 UTC:** all four services switched to "On commit", before the `deployed` job reached `dev` (with "After CI checks pass", Render would wait for that job while the job waits for Render). The switch triggered no deploy. Rollback: set `autoDeployTrigger` back to `checksPass`. `tools/verify-deploy.js` and 4 fast tests; run by hand against dev it reported "live: API and site serve e6248b1".
- **Dev proof, 2026-11-06:** the pipeline pull request merged into `dev` at 12:58:21 UTC (merge commit `d5f2fff`); its push run: `test`, `game` and `deployed` green; `deployed` logged `live: API and site serve d5f2fff…` at 12:59:19, 58 s after the merge.
- **Production proof, 2026-11-07:** the promotion merged at 15:55:28 UTC (`db0ae14`); its push run on `main`: `test`, `game` and `deployed` green; `deployed` logged `live: API and site serve db0ae14…` at 15:56:41, 73 s after the merge.

### 4. Auto-merge: done

Repository setting on; merges are armed with a person's token, never `GITHUB_TOKEN` (its merges start no workflows).

- **Done 2026-11-06:** repository setting `allow_auto_merge` on. The pipeline pull request: auto-merge armed at 12:49:41 UTC by `alexisdacquay` (merge-commit method) while CI ran; GitHub merged it at 12:58:21 once `test` and `game` passed on an up-to-date branch; the merge started the `dev` push run 3 s later (12:58:24), so a person's merge does start workflows.
- **Since 2026-11-07:** the builder arms it right after opening each pull request into `dev` with `sh tools/automerge.sh <n>`, which refuses any other base (issue #34). GitHub now also waits for `qa`.

### 5. Outside observer (Checkly): superseded

Replaced on 2026-11-06 by [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md): Better Stack checks that the game sites and the save APIs are up, and the `deployed` job (step 3) checks the commit.

## Findings

- Production sent no telemetry, and Dash0 was a single point of failure: both superseded on 2026-11-06 by [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md) (Sentry replaced Dash0).

## Checked and cleared

- Postgres expiry: both v4 databases are on a paid plan (`basic-256mb`), not Free. The v3 services and databases were deleted on 2026-11-06 on the owner's instruction.
