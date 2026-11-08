# Status

Where the project stands and what comes next, on one page. It is updated at the end of every step; the details live in the linked plans, and the backlog is [GitHub Issues](https://github.com/alexisdacquay/immune-citadel-v4/issues).

Last update: 2026-11-08, for the promotion of 2026-11-08 (fonts [#108](https://github.com/alexisdacquay/immune-citadel-v4/pull/108), smoke [#107](https://github.com/alexisdacquay/immune-citadel-v4/pull/107)), which puts production and `dev` on the same code.

## At a glance

- **Production** runs `274d452`, the promotion of 2026-11-08 (PR #110: fonts [#108](https://github.com/alexisdacquay/immune-citadel-v4/pull/108), smoke [#107](https://github.com/alexisdacquay/immune-citadel-v4/pull/107)): the whole 18-level campaign on the body map, cloud saves, the save API's one-trace-ID observability (on production since the owner set its key on 2026-11-08: a trace and a log line seen, the metric not checked), the game's crash reports without the player's browser identifier ([#94](https://github.com/alexisdacquay/immune-citadel-v4/issues/94)), the game's fonts served from its own site instead of Google Fonts, and a read-only smoke and privacy check after every push to `dev` or `main` (CI's `deployed` job).
- **Dev** runs the same code as production.
- **In flight:** one pull request to finish ([#90](https://github.com/alexisdacquay/immune-citadel-v4/pull/90)), in conflict with `dev`.
- **Next:** the rubric work ([#77](https://github.com/alexisdacquay/immune-citadel-v4/issues/77), P0).

## Where things run

| Environment | Commit | What it has |
|---|---|---|
| Production (`main`) | `274d452`, the promotion of 2026-11-08 (PR #110: fonts [#108](https://github.com/alexisdacquay/immune-citadel-v4/pull/108), smoke [#107](https://github.com/alexisdacquay/immune-citadel-v4/pull/107)) | the body map (#39, #40), P0 bug fixes (#1-#9), intro cards (#10), the owed-card fix (#37), wave-marker and HUD fixes (#21, #22, #23), cloud saves, Sentry in the game with no browser identifier (#94), gameplay events, uptime checks on both sites and both APIs, the save API's trace, log line and metric under one trace ID (#82; on production since 2026-11-08, a trace and a log line seen, the metric not checked), the deploy pipeline and QA in two stages (#92), the game's fonts from its own site (#108), a read-only smoke and privacy check in CI's `deployed` job (#107) |
| Dev (`dev`) | the same code as production | |

**The first 2026-11-08 promotion ([#96](https://github.com/alexisdacquay/immune-citadel-v4/pull/96)).** The owner authorised it in writing, once a pre-promotion mega test was green: every suite and the bot on all 18 levels, the live dev site in a real browser on three screen sizes, an attack on the save API, children's data checked in Sentry, all past failures re-asked, and a sweep of the repository. It found one privacy leak, already live: the game's crash reports carried the player's browser identifier. That was fixed in [#95](https://github.com/alexisdacquay/immune-citadel-v4/pull/95) before the promotion. On production right after: the API's `/health` and the site's `/version.txt` serve `ee5728d`, CI's `deployed` job is green, and a read-only smoke test found no errors and nothing identifying in what the game sends to Sentry.

**The save API in Sentry.** The owner set `SENTRY_DSN` on the production save API on 2026-11-08 (deploy at 07:41 UTC). At 07:47 UTC one load of an unknown save code on production gave a Sentry trace, reading the production database, and a log line with environment `production`; the metric was not checked separately. The save API's alert rule has no environment filter, so a save API error in production emails the owner.

**The promotion of 2026-11-08 (fonts [#108](https://github.com/alexisdacquay/immune-citadel-v4/pull/108), smoke [#107](https://github.com/alexisdacquay/immune-citadel-v4/pull/107)).** The owner approved it on 2026-11-08. It brings the game's fonts from its own site, so a player's browser no longer contacts Google ([#99](https://github.com/alexisdacquay/immune-citadel-v4/issues/99) closed; the DPIA re-signed by the owner on 2026-11-08), and `tools/smoke.js`, a read-only smoke and privacy check of the live site in CI's `deployed` job on `dev` and `main`. Since this promotion the Render Blueprint reads `main` with auto-sync on, so infrastructure changes reach Render only when promoted.

How the parts connect: [README, How it fits together](../README.md#how-it-fits-together). How QA works: [TEAM.md](TEAM.md#how-qa-works-two-stages).

## In flight

| Pull request | What | State | Next |
|---|---|---|---|
| [#90](https://github.com/alexisdacquay/immune-citadel-v4/pull/90) | a real Sentry check after every deploy to `dev` (CI job `observed`), and a local Sentry receiver for the tests (#70) | auto-merge armed; `test`, `game` and `qa` green from its run of 2026-11-07, judged by the previous QA; in conflict with `dev`, so GitHub cannot merge it. Its description has no `## QA checks`, so any new push fails the new stage 1 | resolve the conflict and add its QA checks in the same push; once merged, the `observed` job runs on every deploy to `dev` |

## Plans

| Plan | Done | Left |
|---|---|---|
| [PIPELINE-PLAN.md](PIPELINE-PLAN.md): trustworthy deploys | steps 1-4: the site publishes only the game; rules on `dev` and `main`; deploy on every commit with the `deployed` proof; auto-merge | nothing: closed (its step 5 moved to the observability plan) |
| [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md): Sentry, own gameplay events, Better Stack | steps 1-5, proven on `dev`; step 6 in part: promoted, uptime checks on both APIs, and the production save API in Sentry (2026-11-08); step 7 on `dev` and production (#82) | step 7: one real save on `dev` shown in Sentry, with screenshots, and its automatic check (#90). Step 6: left: the production checks |

## What is next

In the order the team loop uses: `P0` first, then the owner's latest priority, then `P1`, then `P2`.

| # | Work | Why now |
|---|---|---|
| 1 | Rubric: full marks with margin, obvious to any reviewer ([#77](https://github.com/alexisdacquay/immune-citadel-v4/issues/77), P0): README's "For reviewers" table, then at least three independent cold reviews | the only P0; no review report is linked yet |
| 2 | Finish #70 on `dev`: land #90, and add screenshots of one real save to [OPERATIONS, Follow one save](OPERATIONS.md#follow-one-save) | #70's after-merge item: one save on `dev` shown in Sentry as trace, log line and metric, with screenshots; the other one, `SENTRY_DSN` back on the production API, is done (2026-11-08) |
| 3 | QA: count real catches and false alarms of both stages on each pull request until 2026-11-21, then decide what changes | set on 2026-11-07; stage 1 in its new form has run in CI on [#97](https://github.com/alexisdacquay/immune-citadel-v4/pull/97), [#107](https://github.com/alexisdacquay/immune-citadel-v4/pull/107) and [#108](https://github.com/alexisdacquay/immune-citadel-v4/pull/108), all PASS |
| 4 | P1 backlog: a backup model for QA (#83), body map zones in reading order (#78), trading-card design (#79, mock-ups first, the owner picks) | the owner's P1s that can start without the owner |
| 5 | P2 backlog: an unlocked level looks cleared on the body map (#84, a bug), more enemy variety (#80), game content out of `index.html` (#17), Chapter 2 (#11) | planned |

## Waiting on the owner

| Item | Why it waits |
|---|---|
| Playtest the campaign ([#18](https://github.com/alexisdacquay/immune-citadel-v4/issues/18)) | the balance bot cannot judge fun, clarity or repetition |
| Approve the next promotion | only the owner approves a merge into `main` |
| On-call agent ([#27](https://github.com/alexisdacquay/immune-citadel-v4/issues/27), P1, rubric criterion 12): do reviewers accept a scheduled job that checks Sentry as "wakes on an alert"? | the design question to settle before it is built |

## Parked by the owner

| Item | Note |
|---|---|
| Chronic challenge balance ([#20](https://github.com/alexisdacquay/immune-citadel-v4/issues/20)) | roadmap, P2; target when picked up: the bot wins about 5 of 6 |
| The owner's home IP in one QA bot comment (PR #69) and one Actions log | left as they are: the owner's decision of 2026-11-08 ("it will take time to fix") |
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
