# Status

Where the project stands and what comes next, on one page. It is updated at the end of every step; the details live in the linked plans, and the backlog is [GitHub Issues](https://github.com/alexisdacquay/immune-citadel-v4/issues).

Last update: 2026-11-12: production runs the head of [`main`](https://github.com/alexisdacquay/immune-citadel-v4/commits/main), the commit its save API's [/health](https://immune-citadel-v4-api.onrender.com/health) names; proof of every course criterion: [PROOF.md](PROOF.md).

## At a glance

- **Production** runs the head of `main`, the commit its save API's `/health` names, with every promotion listed under [Promotions](#promotions): the whole 18-level campaign on the body map, cloud saves (deleted after 13 months unchanged), the save API's one-trace-ID observability, crash reports and load reports that respect Play stats and Global Privacy Control, the game's own fonts, phone and laptop layout fixes, the on-call agent, and, after every push to `dev` or `main`, a read-only smoke and privacy check and a check that one save reaches Sentry.
- **Dev** runs production's code plus every pull request merged into `dev` since the last promotion.
- **In flight:** the [open pull requests](https://github.com/alexisdacquay/immune-citadel-v4/pulls).
- **Next:** the rubric work (P0).

## Where things run

| Environment | Commit | What it has |
|---|---|---|
| Production (`main`) | the head of `main`, named by the save API's `/health` | what each promotion brought: [Promotions](#promotions) |
| Dev (`dev`) | the head of `dev`: production plus every pull request merged into `dev` since the last promotion | |

## Promotions

Every promotion of `dev` into `main`, the production branch, each after the owner's written go ([PROOF, CI/CD](PROOF.md#9-cicd)). Until 2026-11-08 they were made in the project's original repository, whose pull requests and CI runs are not public (screenshots in [PROOF, CI/CD](PROOF.md#9-cicd)); each of those merge commits is the same commit on `main` here. From [#69](https://github.com/alexisdacquay/immune-citadel-v4/pull/69) on, the promotion pull requests are here. Each one's CI run on `main` was green: `test`, `game` and `deployed` (the commit is live).

| Merge commit | Merged (UTC) | What it brought |
|---|---|---|
| [`db0ae14`](https://github.com/alexisdacquay/immune-citadel-v4/commit/db0ae14) | 2026-11-07 15:55 | the first promotion: the 18-level campaign, cloud saves, Sentry in the game, gameplay events, the deploy pipeline |
| [`ee5728d`](https://github.com/alexisdacquay/immune-citadel-v4/commit/ee5728d) | 2026-11-08 01:38 | the save API's trace, log line and metric under one trace ID; no browser identifier in the game's crash reports ([#48](https://github.com/alexisdacquay/immune-citadel-v4/issues/48)); QA stage 1 |
| [`a296382`](https://github.com/alexisdacquay/immune-citadel-v4/commit/a296382) | 2026-11-08 02:05 | docs only: STATUS and OPERATIONS for the promotion before it |
| [`274d452`](https://github.com/alexisdacquay/immune-citadel-v4/commit/274d452) | 2026-11-08 08:33 | the game's fonts from its own site, so a player's browser no longer contacts Google ([#49](https://github.com/alexisdacquay/immune-citadel-v4/issues/49)); the smoke and privacy check in `deployed`; the "Your data" wording on Sentry; the DPIA re-signed |
| [`9aa33f5`](https://github.com/alexisdacquay/immune-citadel-v4/commit/9aa33f5) | 2026-11-08 12:09 | the "Your data" and cloud popovers fit a landscape phone, so the Play stats switch can be reached; the fonts build without its guard |
| [`ee4783d`](https://github.com/alexisdacquay/immune-citadel-v4/commit/ee4783d) | 2026-11-08 16:40 | the launch release: reviewer docs and Sentry screenshots, phone and laptop fixes, Sentry traces that follow Play stats, save retention, the log fix of [#52](https://github.com/alexisdacquay/immune-citadel-v4/issues/52), the on-call agent, the DPIA re-signed |
| [`d3f7a43`](https://github.com/alexisdacquay/immune-citadel-v4/commit/d3f7a43) | 2026-11-08 17:29 | the on-call agent's first drill, recorded, and its fix of the drill's planted fault |
| [`5ec8a26`](https://github.com/alexisdacquay/immune-citadel-v4/commit/5ec8a26) | 2026-11-08 19:07 | docs only: the proof page for course reviewers ([PROOF.md](PROOF.md)), every rubric criterion with screenshots and raw output, linked from the README |
| [`cbe012e`](https://github.com/alexisdacquay/immune-citadel-v4/commit/cbe012e) | 2026-11-08 19:49 | a check in CI's `deployed` job: after every deploy, one save under a known trace ID must reach Sentry as a trace, a log line and a metric, on dev and production; no change to the game or the save API |
| [`a8e90f0`](https://github.com/alexisdacquay/immune-citadel-v4/commit/a8e90f0) | 2026-11-12 17:30 | [#69](https://github.com/alexisdacquay/immune-citadel-v4/pull/69): the fixes from the tracker, pull requests [#59](https://github.com/alexisdacquay/immune-citadel-v4/pull/59) to [#94](https://github.com/alexisdacquay/immune-citadel-v4/pull/94) (save API limits and errors, two game fixes, the QA agent's rules, docs true for this repository); `main` run [43270181878](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/43270181878) green |

Infrastructure and telemetry events around them:

- **2026-11-06:** the first Blueprint sync adopted the existing services, moved both APIs from Free to Starter, and grew the dev database disk to 15 GB like production's.
- **2026-11-08, 07:41 UTC:** the owner set `SENTRY_DSN` on the production save API. At 07:47 UTC one load on production gave a Sentry trace reading the production database and a log line with environment `production`; `http.server.request.duration` points with environment `production` are in Sentry too (checked 2026-11-08).
- **2026-11-08, about 07:58 UTC:** the last Blueprint sync from `dev` made both game sites copy `fonts/`.
- **2026-11-08, 08:34 UTC,** after `274d452`: the Blueprint switched to `main` with auto-sync on; its first plan from `main` found no changes.
- **2026-11-08, 12:09:54 UTC:** the first sync after a change on `main` (`9aa33f5`) dropped the fonts guard from both sites' build and redeployed both sites.
- **After `9aa33f5`:** an independent check in a real browser at 844x390, 932x430, 1180x820 and 1440x900 found the Play stats switch reachable and working at every size; on most landscape phones it sits below the popover's fold, with nothing showing that the popover scrolls.

How the parts connect: [README, How it fits together](../README.md#how-it-fits-together). How QA works: [TEAM.md](TEAM.md#how-qa-works-two-stages).

## In flight

| Pull request | What | State | Next |
|---|---|---|---|
| the [open pull requests](https://github.com/alexisdacquay/immune-citadel-v4/pulls) | in each one's description | its checks | |

## Plans

| Plan | Done | Left |
|---|---|---|
| [PIPELINE-PLAN.md](PIPELINE-PLAN.md): trustworthy deploys | steps 1-4: the site publishes only the game; rules on `dev` and `main`; deploy on every commit with the `deployed` proof; auto-merge | nothing: closed (its step 5 moved to the observability plan) |
| [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md): Sentry, own gameplay events, Better Stack | steps 1-5, proven on `dev`; step 6 in part: promoted, uptime checks on both APIs, and the production save API in Sentry (2026-11-08); step 7 on `dev` and production, with the screenshots of one real dev save (2026-11-08), and CI's `deployed` job checking after every deploy that a save still reaches Sentry | step 6: the production checks (a test error from the production game and save API, a played level on production in the funnel query) |

## What is next

In the order the team loop uses: `P0` first, then the owner's latest priority, then `P1`, then `P2`.

| # | Work | Why now |
|---|---|---|
| 1 | Rubric: full marks with margin, obvious to any reviewer (P0): README's "For reviewers" table, in the rubric's words with the points claimed (2026-11-08), then at least three independent cold reviews | the only P0; no review report is linked yet |
| 2 | QA: count real catches and false alarms of both stages on each pull request until 2026-11-21, then decide what changes | set on 2026-11-07; stage 1 in its new form has run in CI on every pull request into `dev` since 2026-11-08, first in the original repository |
| 3 | P1 backlog: body map zones in reading order ([#40](https://github.com/alexisdacquay/immune-citadel-v4/issues/40)), trading-card design ([#41](https://github.com/alexisdacquay/immune-citadel-v4/issues/41), mock-ups first, the owner picks) | the owner's P1s that can start without the owner |
| 4 | P2 backlog: more enemy variety ([#42](https://github.com/alexisdacquay/immune-citadel-v4/issues/42)), game content out of `index.html` ([#17](https://github.com/alexisdacquay/immune-citadel-v4/issues/17)), Chapter 2 ([#11](https://github.com/alexisdacquay/immune-citadel-v4/issues/11)) | planned |

## Waiting on the owner

| Item | Why it waits |
|---|---|
| Playtest the campaign ([#18](https://github.com/alexisdacquay/immune-citadel-v4/issues/18)) | the balance bot cannot judge fun, clarity or repetition |
| Approve the next promotion | the owner's written go, given each time |

## Parked by the owner

| Item | Note |
|---|---|
| Chronic challenge balance ([#20](https://github.com/alexisdacquay/immune-citadel-v4/issues/20)) | roadmap, P2; target when picked up: the bot wins about 5 of 6 |
| the `ic-bug-fixer` and `ic-qa` subagents | the orchestrator builds bugs too, and QA runs in CI ([#34](https://github.com/alexisdacquay/immune-citadel-v4/issues/34)); see [TEAM.md](TEAM.md) |

## Decisions

### 2026-11-12

| Decision | Instead of |
|---|---|
| repository re-created from the original with full history; issues copied without comments; earlier pull requests and runs kept as screenshots ([PROOF](PROOF.md)) | — |

### 2026-11-08

| Decision | Instead of |
|---|---|
| QA stage 1 asks closed YES/NO questions, each 3 times at low effort: the builder's QA checks and the past failures in the files a change touches. The builder owns the test plan (#47) | a short prompt judging the issues' acceptance criteria, which passed real defects on the benchmark |

### 2026-11-07

| Decision | Instead of |
|---|---|
| QA in two stages: a quick required check, and the open review kept but advisory; the orchestrator keeps testing live (#47) | the open review as the only gate (8 real catches, 7 false alarms, 3 runs blocked with no verdict) |
| QA judges changes into `dev` only; a promotion is gated by `test`, `game`, `dev-green` and the owner (#38) | QA on the whole release diff, which raised false alarms |
| one save in Sentry as trace, log line and metric under one trace ID, the same ID in Render's log line (#37) | raw OpenTelemetry export, self-hosting, a second vendor |
| a backup model for QA, on the roadmap as P1 (#44) | DeepSeek alone |
| QA agent as a required CI check; merges into `dev` automatic on green, production by the owner only (#34) | a human or an agent arming each merge |
| `dev` merges without the up-to-date rule; `main` keeps it and needs `dev` green (#35) | GitHub's merge queue (needs Enterprise Cloud on a private repo) |
| diagrams with `diagram-design`, light, never Mermaid | Mermaid |
| repository public; the owner's IP removed from every file and from history (#36); GitHub Support asked to purge old pull-request copies | a fresh repository, which at the time would have lost the issue and pull-request evidence (re-created on 2026-11-12, above) |
| every environment production grade, `dev` mirrors production; `render.yaml` the only place infrastructure changes (#33) | Free instances, one shared database |

### 2026-11-06

| Decision | Instead of |
|---|---|
| Sentry for errors in the game and the save API; Dash0 removed from this project (account kept for another) | Dash0, Grafana, PostHog |
| own gameplay events in our Postgres (children's data stays first-party) | a third-party analytics tool |
| Better Stack for uptime; the `deployed` CI job for "right commit live" | Checkly as an outside observer |
| alerts by email only | a phone pager |
| not covered, accepted: CI never running after a merge; a dashboard rollback leaving an old commit live | a continuous outside check |
