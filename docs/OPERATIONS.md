# Operations

How Immune Citadel runs: where it is deployed, how a change reaches players, what watches it, and what to do when an alert fires. The plans behind this page, with their proof, are [PIPELINE-PLAN.md](PIPELINE-PLAN.md) and [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md).

**On this page:** [Environments](#environments) · [Infrastructure as code](#infrastructure-as-code) · [Releases](#releases) · [QA in two stages](#qa-in-two-stages) · [Branch rules](#branch-rules) · [Rollback](#rollback) · [Restore the database](#restore-the-database) · [Telemetry](#telemetry) · [Follow one save](#follow-one-save) · [Reading gameplay events](#reading-gameplay-events) · [On-call agent](#on-call-agent) · [On-call setup checklist](#on-call-setup-checklist) · [Alert: save API error](#alert-save-api-error) · [Alert: API down](#alert-api-down)

## Environments

| | Game | Save API | Deploys |
|---|---|---|---|
| Production | https://immune-citadel-v4.onrender.com | [immune-citadel-v4-api.onrender.com/health](https://immune-citadel-v4-api.onrender.com/health) | every commit on `main` |
| Dev | https://immune-citadel-v4-dev.onrender.com | [immune-citadel-v4-api-dev.onrender.com/health](https://immune-citadel-v4-api-dev.onrender.com/health) | every commit on `dev` |
| Local | http://localhost:8080 | http://localhost:8787 | `docker compose up --build` (or `npm start`) |

The save API answers only under `/health` and `/api/`; its bare host returns 404.

**Which commit is live:** `GET /health` on a save API returns it (`{"ok":true,"commit":"…"}`), and `/version.txt` on a game site shows it. Render waits for `/health` to answer before a new API deploy takes traffic, so a broken build never does. Every promotion, with its merge commit: [STATUS, Promotions](STATUS.md#promotions).

### What runs on Render

Everything runs on Render in Frankfurt. Everything is production grade, and dev mirrors production: the same services on the same plans, differing only in data, secrets, branch and allowed origins.

| | Production | Dev |
|---|---|---|
| Game: a static site | `immune-citadel-v4` | `immune-citadel-v4-dev` |
| Save API: Node 22 web service, Starter plan (always on), health check `/health` | `immune-citadel-v4-api` | `immune-citadel-v4-api-dev` |
| Database: Postgres 18, `basic-256mb`, 15 GB, point-in-time recovery and daily backups | `immune-citadel-v4-prod-db`, schema `prod` | `immune-citadel-v4-dev-db`, schema `dev` |
| Branch | `main` | `dev` |
| `ALLOWED_ORIGINS` (who may call the API) | the production site | the dev site and `http://localhost:8794` |
| `SENTRY_ENVIRONMENT` | `production` | `dev` |

Locally, `docker compose up` ([compose.yaml](../compose.yaml)) runs the same three parts on your machine: the game behind nginx, the save API, and Postgres 16. Sentry stays off unless `.env` sets `SENTRY_DSN` (see `.env.example`).

### Infrastructure as code

[render.yaml](../render.yaml) declares all six resources, and Render applies it through Blueprint `exs-dbndeu7f3r2c738bllag`. Change a plan or a setting there, never in the dashboard: Render's API refuses a Free-to-paid change on a service, a Blueprint sync does not.

**Today:** the Blueprint reads `main` with auto-sync on, for both environments, so a change to `render.yaml` reaches Render only through a promotion. How it got there, with dates: [STATUS, Promotions](STATUS.md#promotions).

Each database accepts outside connections only from an IP allowlist holding the owner's address. That address is personal, so it is set in Render only, never in `render.yaml` or anywhere in this repository (a Blueprint sync keeps a list the file leaves out).

| Service | Build | Then |
|---|---|---|
| Game site | `mkdir -p public && cp index.html public/ && cp -r fonts public/ && printf %s "$RENDER_GIT_COMMIT" > public/version.txt` (the game and its self-hosted fonts) | publishes `public`, with `SKIP_INSTALL_DEPS=true` |
| Save API | `cd server && npm ci --omit=dev` | starts `cd server && exec npm start` |

Why: the site publishes only the game (Render's default would publish the whole checkout, server code and `node_modules` included), and `/version.txt` names its commit. With `exec`, Render's stop signal reaches npm, which passes it to the API instead of stopping at a shell. `exec` is in `render.yaml` and applied: the Blueprint's plan from `main` found no difference from the running services.

Save API variables: `SENTRY_DSN` (a secret set in Render: Sentry → the project → Client Keys; without it, Sentry is off), `SENTRY_ENVIRONMENT`, `DB_SCHEMA`, `ALLOWED_ORIGINS`, `DATABASE_URL` (from the database) and `NODE_VERSION`.

On each deploy Render sends `SIGTERM` to the old instance: the API finishes the saves in flight, sends its buffered telemetry, and exits within 25 s (Render kills it at 30 s).

## Releases

![Release pipeline: an issue branch becomes a pull request into dev; CI runs test, game and qa; GitHub auto-merges into dev; Render deploys dev and the CI job deployed proves it; the owner merges dev into main once test, game and dev-green pass; Render deploys production and deployed proves it again. A red check sends the change back or makes GitHub email the owner.](diagrams/release-pipeline.svg)

A change reaches players in six moves:

1. **Branch and pull request.** Work happens on its own branch (`issue/<n>-<slug>`, or `fix/`, `feat/`, `infra/`, `docs/` plus a slug) and enters `dev` only through a pull request. Its description carries a `## QA checks` section, written by the builder ([Writing QA checks](#qa-in-two-stages)).
2. **Checks.** CI runs `test` and `game`, and the QA agent's two stages.
3. **Auto-merge into dev.** Right after opening the pull request, the builder arms auto-merge with `sh tools/automerge.sh <n>`, which refuses any base but `dev`. GitHub merges as soon as `test`, `game` and `qa` are green, with no human in the loop.
4. **Deploy and proof.** Render deploys every commit on `dev`. The CI job `deployed` proves the new commit is live.
5. **Promotion.** A pull request from `dev` into `main` that needs `test`, `game` and `dev-green`. Production is manual: it is merged only on the owner's go for that release; nothing merges into `main` automatically. Render deploys production and `deployed` proves it.
6. **Back into dev.** The promotion's merge commit lands on `main` only, and `main` accepts only a branch that is up to date with it. So the next pull request into `dev` also merges `origin/main` (no file changes), or the next promotion cannot merge. A pull request that only does this fails stage 1, which needs a real `[changes]` check, so it rides with a real change.

| Step | What | Proof |
|---|---|---|
| CI | [ci.yml](../.github/workflows/ci.yml) on every pull request and every push to `dev` and `main`: `test` (unit tests, then integration on the Docker stack; about 1 min) and `game` (a bot plays every level; saves, challenges, Field Guide, phone and tablet layouts; 6 to 7 min; skipped on a pull request that changes only docs, `docs/` or `*.md` files, which cannot change the game) | [green checks on a pull request](screenshots/proof/team-qa-on-oncall-pr.jpg); [a green push run on `main`](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/43270181878) |
| QA | `qa` (required) and `qa-review` (advisory) on every pull request into `dev`: [TEAM, How QA works](TEAM.md#how-qa-works-two-stages) | [the QA checks comment on the on-call fix](screenshots/proof/team-qa-on-oncall-pr.jpg) |
| Auto-merge | armed with a person's token, never `GITHUB_TOKEN`: a merge by `GITHUB_TOKEN` starts no workflows, so there would be no deploy proof. The branch need not be up to date with `dev`: CI runs again on `dev` after every merge, and a red `dev` blocks the next promotion | [PIPELINE-PLAN.md](PIPELINE-PLAN.md), step 4 |
| CD | Render's auto-deploy trigger is "on commit" on all four services; only green pull requests can put a commit on `dev` or `main` | [PIPELINE-PLAN.md](PIPELINE-PLAN.md), step 3 |
| Deploy proof | CI job `deployed` on each push to `dev` or `main`: [tools/verify-deploy.js](../tools/verify-deploy.js) waits until the API's `/health` and the site's `/version.txt` serve the pushed commit, else the run goes red after 15 min (if a newer push arrives first, that push's own run takes over). Then [tools/smoke.js](../tools/smoke.js) plays the live site in Chromium, read-only (Sentry and the page's `/api/` calls are answered locally, nothing is sent or saved), and goes red on a wrong commit, an error, or a save code, user agent, an `ip_address` field, headers or play data in a Sentry payload, or a crash report that does not tell Sentry to drop the IP (`infer_ip` not `never`) | dev: live 58 s after the merge; production: live 73 s after the merge (both in the original repository: [PIPELINE-PLAN.md](PIPELINE-PLAN.md), step 3); [a production run here, `deployed` green, `SMOKE PASS` on `a8e90f0`](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/43270181878); every promotion's merge commit is in [STATUS, Promotions](STATUS.md#promotions) |
| Promotion | [promotion.yml](../.github/workflows/promotion.yml): `dev-green` waits for `dev`'s own CI run on the same commit, deploy proof included, and fails unless it is green; then the promotion is merged by hand, only on the owner's go for that release | [STATUS, Promotions](STATUS.md#promotions): the promotions made in the original repository, by merge commit; [PR #69](https://github.com/alexisdacquay/immune-citadel-v4/pull/69), the first made here |

**Production is manual:** a promotion pull request (`dev` → `main`) is merged only on the owner's go for that release; nothing merges into `main` automatically. [tools/automerge.sh](../tools/automerge.sh) refuses any base but `dev`, no workflow or schedule merges into `main`, and no agent arms auto-merge on a pull request into `main`. The owner's go is a team rule ([AGENTS.md](../AGENTS.md)); GitHub enforces the pull request and its checks, not who merges. Proof: [PROOF, CI/CD](PROOF.md#9-cicd).

### QA in two stages

QA is an independent DeepSeek agent ([tools/qa.js](../tools/qa.js)) that runs as two CI jobs on every pull request into `dev`: `qa`, stage 1, required, asks closed YES or NO questions; `qa-review`, stage 2, advisory, is an open review. The full process, its rules and its proof: [TEAM, How QA works](TEAM.md#how-qa-works-two-stages).

**Writing QA checks.** The builder owns this test plan. One line per thing the change could break, under `## QA checks` in the pull request description, for example (from the stage 1 pull request):

```markdown
## QA checks
- [changes] tools/qa.js: In stage 1, is each question asked 3 times, with the answer at least 2 of them give counting, and UNSURE when all 3 differ?
- [stays] .github/workflows/ci.yml: Do the qa and qa-review jobs run only on pull requests into dev?
```

- `[changes]`: true because of this change. It must be YES on the new code and not YES on the old, otherwise it does not test the change. Every pull request needs at least one.
- `[stays]`: something that must still hold. It must be YES on the new code.
- Phrase each question so YES means right, about behaviour (never "does X appear"), and name the files that hold the answer: the model sees only those files, not library defaults. More guidance: [AGENTS.md](../AGENTS.md), **Test plan**.

**Past failures.** [test/past-failures.md](../test/past-failures.md) holds one line per past failure that reached a player, `dev` or a review, as a closed question. A bug fix adds its line in the same pull request; because stage 1 reads the file from the base branch, a new line counts from the next pull request.

**Known gap:** GitHub reads `ci.yml` from the pull request, so a pull request that edits `ci.yml` can change its own `qa` job. Not fixed yet.

### Branch rules

GitHub rulesets on both branches; nobody bypasses them, and neither branch accepts a force push or deletion.

| | `dev` | `main` |
|---|---|---|
| Ruleset | 27124769, [.github/rulesets/dev.json](../.github/rulesets/dev.json) | 27124774, [.github/rulesets/main.json](../.github/rulesets/main.json) |
| Changes only through a pull request | yes | yes |
| Required checks | `test`, `game`, `qa` | `test`, `game`, `dev-green` |
| Branch must be up to date | no, so auto-merge never stalls | yes |

- `dev-green` lives in its own workflow, [promotion.yml](../.github/workflows/promotion.yml), which runs only on pull requests into `main`. Inside `ci.yml` it would be skipped on every push, and GitHub counts a skipped check as passing ([#38](https://github.com/alexisdacquay/immune-citadel-v4/issues/38)).
- No merge queue: GitHub offers it only to repositories owned by an organisation, and this one belongs to a personal account. So the strict guarantee sits on the promotion, as trunk-based development advises.
- Re-apply a ruleset after editing its file: `gh api -X PUT repos/alexisdacquay/immune-citadel-v4/rulesets/27124769 --input .github/rulesets/dev.json` for `dev`, `gh api -X PUT repos/alexisdacquay/immune-citadel-v4/rulesets/27124774 --input .github/rulesets/main.json` for `main`.

### What goes wrong, and who notices

| Failure | Caught by | Signal |
|---|---|---|
| a test, the game suite or a QA check fails | `test`, `game`, `qa` on the pull request | red check, no merge; `qa` comments which check failed and why |
| a commit tries to bypass CI | the rulesets | push rejected (`GH013`) |
| a broken API build | Render's health check on `/health` | the old deploy keeps traffic; `deployed` goes red after 15 min |
| Render never deploys, or deploys the wrong commit | `deployed` | red run; GitHub emails whoever triggered it (the person who armed auto-merge, today the owner) if their Actions email notifications are on |
| `dev` is red when the owner promotes | `dev-green` | the promotion's check fails |
| a game site is down | Better Stack: HEAD on both sites every 5 min ([observability/betterstack.js](../observability/betterstack.js)) | email |
| a save API is down | Better Stack: GET `/health` on both APIs every 5 min (monitors 5200741, 5200742) | email; [runbook](#alert-api-down) |
| the game crashes on a player's device (dev and production sites) | Sentry, project `immune-citadel-game` | email when an issue is new or returns ([observability/sentry-game-alert.json](../observability/sentry-game-alert.json)), and again when it first reaches production ([observability/sentry-game-alert-production.json](../observability/sentry-game-alert-production.json)) |
| a save or load fails with a server error | Sentry alert: on dev and production (the rule has no environment filter) | email; [runbook](#alert-save-api-error) |
| monitoring stops (a missing `SENTRY_DSN`, a broken SDK) while Sentry shows nothing | CI's `deployed` job: one save under a known trace ID must reach Sentry as a trace, a log line and a metric within 5 minutes ([tools/verify-sentry.js](../tools/verify-sentry.js)) | red run; GitHub emails the owner |
| the on-call wiring breaks (a secret, the deploy key, the Sentry alert's target, the `incident` label), for example after the repository is re-created | CI's `deployed` job: [tools/oncall-preflight.js](../tools/oncall-preflight.js); the rest of the [on-call setup checklist](#on-call-setup-checklist) is manual | red run naming the item and its fix; GitHub emails the owner |
| CI never runs after a merge, or a dashboard rollback leaves an old commit live | not covered | accepted: [OBSERVABILITY-PLAN.md](OBSERVABILITY-PLAN.md#open) |

### Rollback

Either of these:
- **Render dashboard:** the service → Events → Rollback on the last good deploy. It reuses that build. A dashboard rollback turns auto-deploy off: turn it back on afterwards.
- **Revert pull request:** merge a revert; CI runs, then Render redeploys.

### Restore the database

**Never rehearsed:** neither database has been restored yet, so how long it takes is not known.

1. **Restore.** Render → the database (`immune-citadel-v4-prod-db` or `immune-citadel-v4-dev-db`) → Recovery → restore to a point in time inside Render's recovery window. Render creates a new database from it; the old one keeps running.
2. **Lock it down at once.** A new database accepts any IP with valid credentials: set its IP allowlist to the owner's address (the database → Networking), as on the old one ([Infrastructure as code](#infrastructure-as-code)).
3. **Repoint the API.** The API gets `DATABASE_URL` from `fromDatabase` in [render.yaml](../render.yaml), by database name. Put the restored database's name in its `databases` entry and in the API's `fromDatabase`, through a pull request into `dev` and then a promotion: the Blueprint reads `main` for both environments, so even the dev database moves only with a promotion.
4. **Check.** `/health` answers, and a save and a load on the site work.
5. **Clean up.** Once the restored database serves saves, the owner deletes the old one in Render.

A restore brings the data back as it was at that time, so rows deleted since then come back too. The API's prune runs again when it starts and then daily; a save deleted by hand since then must be deleted again by hand.

## Telemetry

![Sentry, Better Stack and the CI deployed job watch the game and the save API and email the owner; each save or load sends Sentry one trace, one log line and one metric under one trace ID](diagrams/observability.svg)

**What is on where:**

| Signal | Dev | Production |
|---|---|---|
| game errors and load speed (Sentry) | on | on since the 2026-11-07 promotion; no production test error recorded |
| save API errors and traces (Sentry) | on | on since 2026-11-08 (`SENTRY_DSN` set) |
| save log lines and metric in Sentry (#37) | on since 2026-11-07 | on since 2026-11-08: a trace and a log line with environment `production` at 07:47 UTC, and `http.server.request.duration` points with environment `production` in Sentry (checked 2026-11-08) |
| gameplay events (own Postgres) | on | the code is on `main` since the 2026-11-07 promotion; no production read is recorded |
| uptime (Better Stack) and deploy proof (`deployed`) | on | on |

**The signals:**

| What | Where | Detail |
|---|---|---|
| save API errors | Sentry, project `immune-citadel-api` | every request that fails with a server error, with its stack trace and route |
| save API traces | same | every request except `/health` and `/api/play`, with its Postgres queries (query text with `$1`, never the values) |
| logs | Render, the service's Logs tab: every request except `/health`. Sentry, Logs: saves and loads only | one JSON line per request: method, route, status, `ms`, and `trace_id` and `span_id` while Sentry is on; never the save code |
| save metric | Sentry, Metrics: `http.server.request.duration` (seconds, OpenTelemetry's name) | one point per save or load, by `http.request.method`, `http.route` and `http.response.status_code`: the count is the request rate, the status codes the errors, the value the speed |
| game errors and load speed | Sentry, project `immune-citadel-game` | dev and production sites only; the release is the commit in `/version.txt`; save codes scrubbed |
| gameplay events | the save API's Postgres: table `events`, views `funnel`, `level_stats`, `card_reads`, `sittings` | dev and production sites only; anonymous; what is and is never collected: [EVENTS.md](EVENTS.md); [how to read them](#reading-gameplay-events) |
| uptime | Better Stack | HEAD on both game sites, GET `/health` on both APIs, every 5 min; apply changes with `node observability/betterstack.js` (needs `BETTERSTACK_API_TOKEN`) |

Sentry organisation `myown-76`, EU region (de.sentry.io); environments `local`, `dev` and `production`. Organisation privacy settings: IP addresses are not stored, and an Advanced Data Scrubbing rule removes the location (`$user.geo`), because Sentry derives it from the IP even when IP storage is off.

**Children's data.** [server/sentry.js](../server/sentry.js) sends no IP, headers, cookies, bodies, query strings, database parameters, local variables or browser identifier (user agent), and replaces any save code (the player's only credential) with `:code` in errors, traces, logs and metrics. Gameplay events (`/api/play`) never reach Sentry. Proof: [server/sentry.test.js](../server/sentry.test.js) and [server/observability.test.js](../server/observability.test.js). Logs name the route `/api/save/:code`, never the code ([server/route.js](../server/route.js), [server/telemetry.test.js](../server/telemetry.test.js)).

A player who closes the tab mid-save is logged in Render (`client left mid-upload`), not reported as an error. Sentry still shows that request's trace as a `PUT` with status 200; Render's line with the same `trace_id` is the truth.

### Follow one save

One save or load gives Sentry one trace, one log line and one metric point, all under the request's trace ID, and Render's log line for that request carries the same `trace_id`. So one ID leads from any signal to the others.

**On any machine, without a Sentry login** (what a course reviewer can run, with Node 22 and no Docker; CI runs it in `test` on every pull request):

```bash
npm ci --prefix server && node --test server/observability.test.js
```

It starts the real API with the real Sentry SDK against a local stand-in for Sentry, and checks that:
- one save gives one trace, one log line and one metric under the trace ID of its Render log line;
- no save code, save, IP or browser identifier leaves;
- gameplay events stay home;
- a closed tab is no error, but is logged;
- a deploy finishes a save in flight;
- a Sentry outage never fails a save.

Each check was proven able to fail by removing the code it guards: 25 removals on 2026-11-07, 13 of them by an independent reviewer. Two removals change nothing on their own, by design: the scrub on logs and metrics (a second guard behind the save-route filter) and the route attribute (fixed inside that filter).

**On dev, with Sentry access:** after a save on the dev site, Render → `immune-citadel-v4-api-dev` → Logs shows its line (`"msg":"request"`, `"route":"/api/save/:code"`) with a `trace_id`. In Sentry, project `immune-citadel-api`, environment `dev`, that trace ID finds the trace (`PUT /api/save/:code` with its Postgres spans), the log line, and the metric point.

**One real save on dev, in Sentry's UI** (2026-11-08, 13:25:47 UTC, trace `e273c17a1ecc4b94b4627985857338e4`). One `PUT /api/save/:code` on the dev API gave:

- **Render's log line**, structured JSON, with the trace ID and the route, never the code:
  `{"level":30,"trace_id":"e273c17a1ecc4b94b4627985857338e4","span_id":"b525e162abb587a9","method":"PUT","route":"/api/save/:code","status":200,"ms":53,"msg":"request"}`
- **The trace** in Sentry: the request span and its Postgres spans (connect, then a parameterised `INSERT`, so no save code or save data in it).

  ![Sentry trace e273c17a: http.server PUT /api/save/:code with its Postgres spans, 4 spans, 1 log, 1 metric, environment dev](screenshots/sentry-trace.jpg)
- **The log line** in Sentry Logs, found by the same trace ID: route `/api/save/:code`, status 200, 53 ms, and its parent span `b525e162abb587a9`, the request span of the trace above.

  ![Sentry Logs filtered on trace e273c17a: one request line with route /api/save/:code and parent span b525e162abb587a9](screenshots/sentry-log.jpg)
- **The metric point** `http.server.request.duration`, listed with the same trace ID (value 0.053 s, status 200). Its trace summary counts the same 4 spans, 1 log and 1 metric.

  ![Sentry Application Metrics: the http.server.request.duration sample of trace e273c17a, 53 ms, with its trace summary](screenshots/sentry-metric.jpg)

## Reading gameplay events

The databases accept outside connections only from their IP allowlist: the owner's machine. If that address changes, update it in Render (the database → Networking, or `PATCH /v1/postgres/<id>` with `ipAllowList`). The Render MCP query tool connects from Render's servers, so the allowlist blocks it.

```bash
docker run --rm -it -e U="$URL?sslmode=require" postgres:18-alpine sh -c 'psql "$U" -c "SELECT * FROM dev.level_stats"'
```

`$URL` is the database's external connection string (Render → the database → Connect, or `GET /v1/postgres/<id>/connection-info`); never commit or paste it. Schemas: `dev` and `prod`. Views: `funnel`, `level_stats`, `card_reads`, `sittings` ([EVENTS.md](EVENTS.md)).

## On-call agent

When a Sentry alert fires, an agent wakes and proposes the fix, with no human in the loop until the merge (rubric: "an agent wakes up on an alert and fixes the issue"; [#27](https://github.com/alexisdacquay/immune-citadel-v4/issues/27)).

1. **The alert opens an issue here.** The save API alert has a second action, "Create a GitHub issue", through Sentry's GitHub integration (installed 2026-11-08).
2. **The agent wakes on it.** The **On-call** workflow ([.github/workflows/oncall.yml](../.github/workflows/oncall.yml)) starts only for an issue opened by Sentry's app (`sentry[bot]`), an issue the owner labels `incident`, or a manual run (Actions → On-call → Run workflow).
3. **It finds the cause.** [tools/oncall.js](../tools/oncall.js) reads the latest event of the Sentry issue: the exception, the frames of our own code, environment and release, never request, user or device data. It gives DeepSeek (`deepseek-v4-pro`) that error and the source files the stack names, and asks for the smallest fix with a regression test and QA checks.
4. **It proves the fix.** It applies the edits all or nothing, then runs `npm run test:unit` sealed in Docker: no network, no secrets, the checkout read-only. On red it sends the failure back, 3 attempts at most.
5. **It opens a pull request into `dev`.** A save API fix merges like any other, on `test`, `game` and `qa`. A game fix waits for a human, because the game's Sentry key is public by design, so anyone can raise a game error and write the text the model reads. Production stays the owner's.
6. **It reports on the incident issue:** when it woke, what it read, the pull request, or why it stopped.

**Guard rails.** It edits only `index.html` and `server/<name>.js` (an allow-list), at most 150 lines and 20,000 characters. The agent's own code runs from `main`, never from `dev`. The error text is untrusted data in its prompt. One agent runs at a time, and a retry replaces its own unmerged branch. The design was reviewed independently on 2026-11-08.

**Latest drill, 2026-11-12: from the first 500 to the fix live on `dev` in 10 minutes, with no human in the loop.** [#156](https://github.com/alexisdacquay/immune-citadel-v4/pull/156) planted a real defect on `dev`, as #27's spec asks: a debug line that counts a save's immune skills with `Object.keys(save.mem)` whenever the save has `diff`, which throws when `mem` is missing. The game always sends `mem` and no test sends `diff`, so CI passed it. Production ran `1251eec` ([#154](https://github.com/alexisdacquay/immune-citadel-v4/pull/154)) throughout. The full record: [PROOF, criterion 12](PROOF.md#12-on-call-agent).

| Time (UTC) | What happened | Proof |
|---|---|---|
| 23:46:28 | one crafted save on `dev`, `{"save":{"diff":"hard"}}` on a new save code, answers 500; Sentry opens IMMUNE-CITADEL-API-4, `TypeError: Cannot convert undefined or null to object` | Sentry issue |
| 23:46:37 | the save API alert fires: it emails the owner and asks Sentry's GitHub integration for an issue | alert 1464000 |
| 23:46:39 | `sentry[bot]` opens the incident issue, labelled `incident` | [#157](https://github.com/alexisdacquay/immune-citadel-v4/issues/157) |
| 23:46:42 | the On-call workflow wakes on it, running the agent from `main` | [run 43331687728](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/43331687728) |
| 23:46:59 | the agent reports on the issue: awake, reading `server/index.js` and `server/test.js` | [comment on the issue](https://github.com/alexisdacquay/immune-citadel-v4/issues/157#issuecomment-6839328422) |
| 23:47:42 | first attempt: the cause (`Object.keys` on a missing `mem`), a type check and a regression test; unit tests green, sealed; it opens a pull request with three QA checks of its own and pushes with the deploy key, so CI starts | [#158](https://github.com/alexisdacquay/immune-citadel-v4/pull/158) |
| 23:55:44 | `test`, `game` and `qa` green (its QA checks [pass](https://github.com/alexisdacquay/immune-citadel-v4/pull/158#issuecomment-6839347584), and the advisory review); auto-merge merges it into `dev` | [run 43331836351](https://github.com/alexisdacquay/immune-citadel-v4/actions/runs/43331836351), [`35bafd4`](https://github.com/alexisdacquay/immune-citadel-v4/commit/35bafd4) |
| 23:56:33 | `dev` serves the fix (`35bafd4`); at 23:56:39 the same crafted save answers 200 | `/health` on the dev API |

The merge was made with GitHub's own token, so `dev`'s push run (and its `deployed` proof) did not start for `35bafd4`; Render deployed it, and the next merge into `dev` runs CI again. The planted line stays, now guarded, and reaches production with the next promotion as harmless debug logging.

The drill's earlier attempts ([#142](https://github.com/alexisdacquay/immune-citadel-v4/issues/142)) found two defects, both fixed before this run:
- Sentry grouped save API errors by their stack, so a new error was filed under an old Sentry issue and opened no incident; [#147](https://github.com/alexisdacquay/immune-citadel-v4/pull/147) ([#146](https://github.com/alexisdacquay/immune-citadel-v4/issues/146)) gives each error type and message its own Sentry issue.
- The agent could write a `[stays]` QA check asking whether code was "unchanged", which the QA agent's stage 1 cannot answer from the new code alone, so its correct fix could not merge; [#151](https://github.com/alexisdacquay/immune-citadel-v4/pull/151) ([#150](https://github.com/alexisdacquay/immune-citadel-v4/issues/150)) makes the agent write only checks stage 1 can answer.

**First drill (original repository, 2026-11-08):** a different planted fault, `save.owe.filter` on a non-list `owe`, fixed live on `dev` in 11 minutes ([screenshot](screenshots/proof/oncall-2-agent-comments.jpg)).

### On-call setup checklist

Redo every item after any move or re-creation of this repository. A new repository starts without the secrets, the deploy key, the labels, the rulesets and the Actions settings, and the GitHub apps and the Sentry alert still point at the old one. After the last re-creation, GitHub Actions was not allowed to open pull requests and nothing noticed: the agent would have found the fix and failed to propose it.

**CI** items are checked by [tools/oncall-preflight.js](../tools/oncall-preflight.js) in CI's `deployed` job, on every push to `dev` and `main`: a broken one turns the run red, with the item and its fix. **Manual** items are beyond what CI's tokens can read: check them by hand. An issue-triggered workflow runs from the default branch, so the agent wakes only once `oncall.yml` is on `main`.

- [ ] **GitHub Actions may open pull requests** (manual: reading the setting needs administration access, which `GITHUB_TOKEN` lacks). Without it the agent's fix pull request is refused. The second call must show `"can_approve_pull_request_reviews":true`:
  ```bash
  gh api -X PUT repos/alexisdacquay/immune-citadel-v4/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true && gh api repos/alexisdacquay/immune-citadel-v4/actions/permissions/workflow
  ```
- [ ] **Sentry's GitHub app can reach this repository** (manual): GitHub → Settings → Applications → Sentry → Configure → Repository access (installed from Sentry → Settings → Integrations → GitHub). Without it the alert cannot open the incident issue.
- [ ] **Render's GitHub app can reach this repository** (manual; `deployed` goes red within 15 minutes when Render stops deploying): GitHub → Settings → Applications → Render → Configure → Repository access, then Render syncs the Blueprint `exs-dbndeu7f3r2c738bllag` again.
- [ ] **The secrets** (CI: `SENTRY_AUTH_TOKEN` must read the Sentry project; `DEEPSEEK_API_KEY` must be set, not tested with a model call). Set each from the clipboard: `pbpaste | gh secret set DEEPSEEK_API_KEY -R alexisdacquay/immune-citadel-v4`. `SENTRY_AUTH_TOKEN` needs the scopes `org:read`, `project:read`, `event:read`. CI's `qa` jobs also need `KILO_API_KEY` and `KILO_BASE_URL` (manual).
- [ ] **The deploy key** (CI: a `git push --dry-run` over ssh with `ONCALL_DEPLOY_KEY` must pass, which needs write access to this repository; nothing is pushed). The agent pushes with it because GitHub starts no CI for what its own `GITHUB_TOKEN` pushes; no personal token is needed. This creates a write deploy key for this repository only and stores its private half as the secret without showing it:
  ```bash
  D=$(mktemp -d) && ssh-keygen -q -t ed25519 -N "" -C "immune-citadel-v4 on-call agent" -f "$D/k" && gh repo deploy-key add "$D/k.pub" -R alexisdacquay/immune-citadel-v4 --allow-write --title "on-call agent" && gh secret set ONCALL_DEPLOY_KEY -R alexisdacquay/immune-citadel-v4 < "$D/k" && rm -rf "$D" && echo "on-call key set"
  ```
- [ ] **The `incident` label** (CI): Sentry puts it on the issues it opens, and the owner adds it to wake the agent by hand. `gh label create incident -R alexisdacquay/immune-citadel-v4 --color B60205 --description "An incident: the owner's label wakes the on-call agent"`
- [ ] **The Sentry alert targets this repository** (CI: alert 1464000 is enabled, fires for `immune-citadel-api`, and has an active GitHub action that opens an issue labelled `incident` here). After a move, change `repo` in [observability/sentry-alert.json](../observability/sentry-alert.json) and apply it through the Sentry MCP (`update_alert_rule`).
- [ ] **The rulesets** (manual): a new repository has none. `gh api -X POST repos/alexisdacquay/immune-citadel-v4/rulesets --input .github/rulesets/dev.json`, the same with `main.json`, then put the new ids in [Branch rules](#branch-rules).

## Alert: save API error

| Its two firings | Its two actions: email, and a GitHub issue |
|---|---|
| ![The save API alert: 2 triggers, Nov 6 and Nov 8](screenshots/proof/alert-1-history.jpg) | ![The alert's actions: notify by email, create a GitHub issue](screenshots/proof/alert-2-actions.jpg) |

**"Save API error (a save or load failed): email owner, wake the on-call agent"**: every error in Sentry project `immune-citadel-api` emails the owner, at most once per 30 min per issue, and opens a GitHub issue that wakes the [on-call agent](#on-call-agent). A warning (only "new saves daily cap reached", sent once a day when the API starts refusing new save codes) emails the owner and opens no issue: it has no stack trace for the agent to fix. Defined in [observability/sentry-alert.json](../observability/sentry-alert.json) (Sentry alert 1464000) and applied through the Sentry MCP.

| | |
|---|---|
| Meaning | a save or load answered 500 |
| Impact | that player's progress is not in the cloud; the game keeps it in the browser and retries on the next save or visit |
| Diagnosis | the Sentry issue's trace → its Postgres span and log line; Render → the API → Logs, search the `trace_id` |
| Mitigation | database down: Render → the database → Events. Bad deploy: [Rollback](#rollback) |

Try it locally (with `SENTRY_DSN` in `.env`): `docker compose up`, make a save, `docker compose stop db`, make another, then `docker compose start db`. Measured 2026-11-06: the failed save at 17:42:21 UTC opened issue IMMUNE-CITADEL-API-1, the alert fired at 17:42:33, and the email arrived.

## Alert: API down

Better Stack emails when `/health` fails and still fails 60 s later.

| | |
|---|---|
| Meaning | the API does not answer, or it started without its database |
| Impact | no player can save or load |
| Diagnosis | Render → the API → Events (did a deploy fail?) and Logs (`startup failed`) |
| Mitigation | [Rollback](#rollback); if the database is down, Render → the database → Events |
