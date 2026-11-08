# Status

Where the project stands and what comes next, on one page. It is updated at the end of every step; the details live in the linked plans, and the backlog is [GitHub Issues](https://github.com/alexisdacquay/immune-citadel-v4/issues).

Last update: 2026-11-08, about 19:00 UTC: production runs `d3f7a43` ([#134](https://github.com/alexisdacquay/immune-citadel-v4/pull/134), the on-call drill record) on top of the launch release `ee4783d` ([#129](https://github.com/alexisdacquay/immune-citadel-v4/pull/129)); proof of every course criterion: [PROOF.md](PROOF.md).

## At a glance

- **Production** runs `d3f7a43` ([#134](https://github.com/alexisdacquay/immune-citadel-v4/pull/134), the on-call drill record) on top of the launch release `ee4783d` ([#129](https://github.com/alexisdacquay/immune-citadel-v4/pull/129)): the whole 18-level campaign on the body map, cloud saves (deleted after 13 months unchanged), the save API's one-trace-ID observability, crash reports and load reports that respect Play stats and Global Privacy Control, the game's own fonts, phone and laptop layout fixes, the on-call agent, and a read-only smoke and privacy check after every push to `dev` or `main`.
- **Dev** runs production's code plus every pull request merged into `dev` since #134.
- **In flight:** the [open pull requests into `dev`](https://github.com/alexisdacquay/immune-citadel-v4/pulls?q=is%3Apr+is%3Aopen+base%3Adev); [#90](https://github.com/alexisdacquay/immune-citadel-v4/pull/90) is in conflict with `dev` (below).
- **Next:** the rubric work ([#77](https://github.com/alexisdacquay/immune-citadel-v4/issues/77), P0).

## Where things run

| Environment | Commit | What it has |
|---|---|---|
| Production (`main`) | `d3f7a43` | what each promotion brought: [Promotions](#promotions) |
| Dev (`dev`) | the head of `dev`: production plus every pull request merged since #134 | |

## Promotions

Every merge into `main`, the production branch. Each needed the owner's written go; then the owner or, on that go, the orchestrator clicked merge. The proof run is `main`'s CI run on that commit: `test`, `game` and `deployed` (the commit is live) green.

| PR | Commit | Merged (UTC) | What it brought | The owner's go | Proof run |
|---|---|---|---|---|---|
| [#73](https://github.com/alexisdacquay/immune-citadel-v4/pull/73) | `db0ae14` | 2026-11-07 15:55 | the first promotion: the 18-level campaign, cloud saves, Sentry in the game, gameplay events, the deploy pipeline | in chat: "promote the repo" | [42388716983](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/42388716983) |
| [#96](https://github.com/alexisdacquay/immune-citadel-v4/pull/96) | `ee5728d` | 2026-11-08 01:38 | the save API's trace, log line and metric under one trace ID (#82); no browser identifier in the game's crash reports (#94, [#95](https://github.com/alexisdacquay/immune-citadel-v4/pull/95)); QA stage 1 (#92) | in chat, in writing: promote "once the mega-test is green", a pre-promotion test of every suite, the live dev site and the save API, which was green | [42435143169](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/42435143169) |
| [#98](https://github.com/alexisdacquay/immune-citadel-v4/pull/98) | `a296382` | 2026-11-08 02:05 | docs only: STATUS and OPERATIONS for #96 (#97) | the written go of #96, read as covering this docs-only follow-up | [42437059743](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/42437059743) |
| [#110](https://github.com/alexisdacquay/immune-citadel-v4/pull/110) | `274d452` | 2026-11-08 08:33 | the game's fonts from its own site, so a player's browser no longer contacts Google (#108, #99); the smoke and privacy check in `deployed` (#107); the "Your data" wording on Sentry (#109); the DPIA re-signed | in chat: "ok" to five steps, among them this promotion and the Blueprint on `main` | [42463417842](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/42463417842) |
| [#113](https://github.com/alexisdacquay/immune-citadel-v4/pull/113) | `9aa33f5` | 2026-11-08 12:09 | the "Your data" and cloud popovers fit a landscape phone, so the Play stats switch can be reached (#112); the fonts build without its guard (#111) | in chat: "Yes, promote" | [42478940135](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/42478940135) |
| [#129](https://github.com/alexisdacquay/immune-citadel-v4/pull/129) | `ee4783d` | 2026-11-08 16:40 | the launch release: reviewer docs and Sentry screenshots, phone and laptop fixes, Sentry traces that follow Play stats, save retention, the #102 log fix, the on-call agent, the DPIA re-signed | the owner, in chat: "Yes, promote", then "I approve. In the future, please proxy for me" | [42501133770](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/42501133770) |
| [#134](https://github.com/alexisdacquay/immune-citadel-v4/pull/134) | `d3f7a43` | 2026-11-08 17:29 | the on-call agent's first drill, recorded (#133), and its fix (#132) of the drill's planted fault (#130) | the owner's standing written go: "In the future, please proxy for me" (2026-11-08), quoted in the pull request | [42505199017](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/42505199017) |

Infrastructure and telemetry events around them:

- **2026-11-06:** the first Blueprint sync adopted the existing services, moved both APIs from Free to Starter, and grew the dev database disk to 15 GB like production's.
- **2026-11-08, 07:41 UTC:** the owner set `SENTRY_DSN` on the production save API. At 07:47 UTC one load on production gave a Sentry trace reading the production database and a log line with environment `production`; `http.server.request.duration` points with environment `production` are in Sentry too (checked 2026-11-08).
- **2026-11-08, about 07:58 UTC:** the last Blueprint sync from `dev` made both game sites copy `fonts/`.
- **2026-11-08, 08:34 UTC,** after #110: the Blueprint switched to `main` with auto-sync on; its first plan from `main` found no changes.
- **2026-11-08, 12:09:54 UTC:** the first sync after a change on `main` (#113) dropped the fonts guard from both sites' build and redeployed both sites.
- **After #113:** an independent check in a real browser at 844x390, 932x430, 1180x820 and 1440x900 found the Play stats switch reachable and working at every size; on most landscape phones it sits below the popover's fold, with nothing showing that the popover scrolls.

How the parts connect: [README, How it fits together](../README.md#how-it-fits-together). How QA works: [TEAM.md](TEAM.md#how-qa-works-two-stages).

## In flight

| Pull request | What | State | Next |
|---|---|---|---|
| [#90](https://github.com/alexisdacquay/immune-citadel-v4/pull/90) | a real Sentry check after every deploy to `dev` (CI job `observed`), and a local Sentry receiver for the tests (#70) | auto-merge armed; `test`, `game` and `qa` green from its run of 2026-11-07, judged by the previous QA; in conflict with `dev`, so GitHub cannot merge it. Its description has no `## QA checks`, so any new push fails the new stage 1 | resolve the conflict and add its QA checks in the same push; once merged, the `observed` job runs on every deploy to `dev` |

## Plans

| Plan | Done | Left |
|---|---|---|
| [PIPELINE-PLAN.md](PIPELINE-PLAN.md): trustworthy deploys | steps 1-4: the site publishes only the game; rules on `dev` and `main`; deploy on every commit with the `deployed` proof; auto-merge | nothing: closed (its step 5 moved to the observability plan) |
| [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md): Sentry, own gameplay events, Better Stack | steps 1-5, proven on `dev`; step 6 in part: promoted, uptime checks on both APIs, and the production save API in Sentry (2026-11-08); step 7 on `dev` and production (#82) | step 7: its automatic check (#90); the screenshots of one real dev save are done (2026-11-08). Step 6: the production checks are left |

## What is next

In the order the team loop uses: `P0` first, then the owner's latest priority, then `P1`, then `P2`.

| # | Work | Why now |
|---|---|---|
| 1 | Rubric: full marks with margin, obvious to any reviewer ([#77](https://github.com/alexisdacquay/immune-citadel-v4/issues/77), P0): README's "For reviewers" table, in the rubric's words with the points claimed (2026-11-08), then at least three independent cold reviews | the only P0; no review report is linked yet |
| 2 | Finish #70 on `dev`: land #90 (the `observed` CI job) | the screenshots of one real dev save in Sentry are in [OPERATIONS, Follow one save](OPERATIONS.md#follow-one-save) (2026-11-08), and `SENTRY_DSN` is back on the production API; #90 would repeat the check after every deploy |
| 3 | QA: count real catches and false alarms of both stages on each pull request until 2026-11-21, then decide what changes | set on 2026-11-07; stage 1 in its new form has run in CI on every pull request into `dev` since [#93](https://github.com/alexisdacquay/immune-citadel-v4/pull/93) |
| 4 | P1 backlog: a backup model for QA (#83), body map zones in reading order (#78), trading-card design (#79, mock-ups first, the owner picks) | the owner's P1s that can start without the owner |
| 5 | P2 backlog: a save whose `owe` is not a list blocks that code's cloud sync ([#101](https://github.com/alexisdacquay/immune-citadel-v4/issues/101)); an unlocked level looks cleared on the body map (#84, a bug), more enemy variety (#80), game content out of `index.html` (#17), Chapter 2 (#11) | planned |

## Waiting on the owner

| Item | Why it waits |
|---|---|
| Playtest the campaign ([#18](https://github.com/alexisdacquay/immune-citadel-v4/issues/18)) | the balance bot cannot judge fun, clarity or repetition |
| Approve the next promotion | the owner's written go, given each time or as the standing go of 2026-11-08 |

## Parked by the owner

| Item | Note |
|---|---|
| Chronic challenge balance ([#20](https://github.com/alexisdacquay/immune-citadel-v4/issues/20)) | roadmap, P2; target when picked up: the bot wins about 5 of 6 |
| A personal value in one old bot comment and one Actions log | left as they are: the owner's decision of 2026-11-08 ("it will take time to fix") |
| the `ic-bug-fixer` and `ic-qa` subagents | the orchestrator builds bugs too, and QA runs in CI (#61); see [TEAM.md](TEAM.md) |

## Decisions

### 2026-11-08

| Decision | Instead of |
|---|---|
| QA stage 1 asks closed YES/NO questions, each 3 times at low effort: the builder's QA checks and the past failures in the files a change touches. The builder owns the test plan (owner's design, #88) | a short prompt judging the issues' acceptance criteria (#89), which passed real defects on the benchmark |

### 2026-11-07

| Decision | Instead of |
|---|---|
| QA in two stages: a quick required check, and the open review kept but advisory; the orchestrator keeps testing live (#88) | the open review as the only gate (8 real catches, 7 false alarms, 3 runs blocked with no verdict) |
| QA judges changes into `dev` only; a promotion is gated by `test`, `game`, `dev-green` and the owner (#75) | QA on the whole release diff, which raised false alarms (#73) |
| one save in Sentry as trace, log line and metric under one trace ID, the same ID in Render's log line (#70) | raw OpenTelemetry export, self-hosting, a second vendor |
| a backup model for QA, on the roadmap as P1 (#83) | DeepSeek alone |
| QA agent as a required CI check; merges into `dev` automatic on green, production by the owner only (#61) | a human or an agent arming each merge |
| `dev` merges without the up-to-date rule; `main` keeps it and needs `dev` green (#63) | GitHub's merge queue (needs Enterprise Cloud on a private repo) |
| diagrams with `diagram-design`, light, never Mermaid | Mermaid |
| repository public; the owner's IP removed from every file and from history (#68); GitHub Support asked to purge old pull-request copies | a fresh repository (would lose the issue and pull-request evidence) |
| every environment production grade, `dev` mirrors production; `render.yaml` the only place infrastructure changes (#57) | Free instances, one shared database |

### 2026-11-06

| Decision | Instead of |
|---|---|
| Sentry for errors in the game and the save API; Dash0 removed from this project (account kept for another) | Dash0, Grafana, PostHog |
| own gameplay events in our Postgres (children's data stays first-party) | a third-party analytics tool |
| Better Stack for uptime; the `deployed` CI job for "right commit live" | Checkly as an outside observer |
| alerts by email only | a phone pager |
| not covered, accepted: CI never running after a merge; a dashboard rollback leaving an old commit live | a continuous outside check |
