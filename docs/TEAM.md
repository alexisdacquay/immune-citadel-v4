# Agent team and process

Immune Citadel v4 is built by AI agents and one human owner, Alexis Dacquay. This page says who does what, how one piece of work goes from an idea to production, and how the work is checked. It describes the process the repository actually runs; every step leaves a trace on GitHub that you can open.

## The team

| Role | Who | Owns | Never does |
|---|---|---|---|
| **Owner** | Alexis Dacquay, the only human | priorities, design approvals, playtests, the written go for every promotion into production (`main`) | |
| **Orchestrator** | the main Claude Code session | the backlog, each issue's spec and acceptance criteria, design decisions, **building every issue** (bugs included while the bug-fixer is paused), **the test plan** (see below), live testing, opening pull requests and arming auto-merge into `dev`, short reports to the owner | merge into `main` without the owner's written go (a promotion's own, or the owner's standing go of 2026-11-08, quoted in the pull request), or arm auto-merge on it |
| **QA** | an independent DeepSeek agent ([tools/qa.js](../tools/qa.js), model `deepseek-flash`) in two CI jobs on every pull request into `dev` | stage 1, `qa` (required): closed YES/NO questions. Stage 2, `qa-review` (advisory): an open review. Both post their verdict as a comment on the pull request | edit code; stage 1 sees only the files a question names and the question itself, never the builder's notes or chat |
| **On-call agent** | an independent DeepSeek agent ([tools/oncall.js](../tools/oncall.js), model `deepseek-v4-pro`), woken by a Sentry alert through the issue it opens ([OPERATIONS, On-call agent](OPERATIONS.md#on-call-agent)) | an incident: reads the error from Sentry, finds the cause, opens a pull request into `dev` with the fix, a regression test and QA checks, and reports on the incident issue | merge into `main`; edit anything but `index.html` and `server/*.js`; run the fix's tests with access to a secret or the network |
| **Panels** | groups of short-lived Claude subagents run as one workflow | wide questions one agent should not answer alone: design options (designers, then judges) and audits (finders, then independent verifiers) | decide: a panel returns options and evidence, and the orchestrator decides |

**Paused by the owner:** the bug-fixer subagent [`ic-bug-fixer`](../.claude/agents/ic-bug-fixer.md), which fixed one `bug` issue on its own branch, and the Opus QA subagent [`ic-qa`](../.claude/agents/ic-qa.md), which posted a QA verdict on the issue. QA moved into CI on 2026-11-07 ([#34](https://github.com/alexisdacquay/immune-citadel-v4/issues/34)). Issue [#21](https://github.com/alexisdacquay/immune-citadel-v4/issues/21) went through that older route end to end: spec, engineer report, QA verdict FAIL, second round, PASS. Those comments stayed in the original repository. A screenshot kept here shows only the QA subagent's part: [its round-2 verdict](screenshots/proof/spec-qa-verdict.jpg) on [#24](https://github.com/alexisdacquay/immune-citadel-v4/issues/24), a chore the builder fixed, not the bug-fixer.

**Why this split.** Design, content and balance carry intent that gets lost in a handoff, and the game is one file (`index.html`), so parallel builders would collide: one builder is safer. The checking is kept independent: a different model from a different provider answers the questions from the code alone, so the builder's confidence cannot leak into the verdict.

## How QA works: two stages

![QA in two stages on a pull request into dev. The builder's QA checks and the past failures in the changed files feed stage 1, the required job qa: closed YES or NO questions at low effort, 3 votes each. GitHub auto-merges into dev once test, game and qa are green; Render deploys dev and the deployed job proves the new commit is live; dev reaches main only on the owner's written go. Stage 2, the advisory job qa-review, runs after test and game pass and only comments; its findings are fixed or answered before a promotion](diagrams/qa-stages.svg)

| | Stage 1: `qa` | Stage 2: `qa-review` |
|---|---|---|
| **Question** | closed: YES, NO or UNSURE | open: judge the change against its acceptance criteria and list real defects |
| **Questions come from** | the pull request's `## QA checks`, written by the builder, and the past failures in [test/past-failures.md](../test/past-failures.md) that name a file the change touches | the acceptance criteria of the issues the pull request names |
| **The agent sees** | the full text of the files each question names, in the merge that would land (and, for a `[changes]` check, in the code before the change) | the diff (without lockfiles and diagram SVGs, which are named as left out), the pull request description, the issues |
| **How the model is asked** | low reasoning effort, up to 64,000 tokens, each question 3 times: the answer given at least twice counts, otherwise UNSURE; a failed call is retried | once, up to 12 minutes |
| **When DeepSeek fails** | after its retries, the same request once on a backup model from another provider (`google/gemini-3.5-flash` through the Kilo gateway); the comment names the models that answered. Both failing: the question is UNSURE with both errors, so the check fails | the same request once on the backup; the comment names the model |
| **When** | beside `test` and `game`, so it adds no wait | after `test` and `game` pass |
| **Result** | a **QA checks: PASS/FAIL** comment: one row per question, with the old and new answers and the line of code that decided | a **QA review (advisory, does not block)** comment: criteria, evidence, defects |
| **Blocks the merge?** | yes: it is a required check on `dev` | no; before a promotion, every finding is fixed or answered |

A stage 1 check passes only when:

- the answer on the new code is **YES**;
- for a `[changes]` check, the answer on the old code is **not** YES as well. A check that was already true before the change does not test the change, so it fails;
- the pull request has at least one `[changes]` check, and every check line can be read. A malformed line fails the job rather than being skipped.

The agent must quote the code that decides its answer. Code comments do not count as evidence, because a comment can claim what the code does not do.

Both jobs run only on pull requests into `dev`. A promotion into `main` is not judged again (owner, 2026-11-07, [#38](https://github.com/alexisdacquay/immune-citadel-v4/issues/38)): each change already passed QA on its way into `dev`, and judging the whole release diff at once produced false alarms. The judge itself, `tools/qa.js`, and the past failures are read from the base branch, so a pull request cannot rewrite the script or drop the questions that judge it; a change to either applies from the next pull request.

### Why closed questions

Until 2026-11-07, QA was a single open review. Its record on every blocking verdict: 8 real defects caught, 7 false alarms, and 3 runs that blocked with no verdict because the model ran out of time or tokens ([#47](https://github.com/alexisdacquay/immune-citadel-v4/issues/47)). A first two-stage design, a short prompt judging the acceptance criteria, passed real defects on a benchmark: it was merged, then replaced after the owner rejected it. The owner's design, approved on 2026-11-08: give the agent simple, closed tasks at low effort, many of them, for quick signals, and let the builder, who knows what the change could break, write the questions.

Stage 1 in this form arrived with a pull request on 2026-11-08, in the original repository. That pull request's own `qa` job still ran the previous judge, so the first pull request judged by the new stage 1 in CI was the next one; every pull request into `dev` since then has been judged by it. Before merging, the builder ran it locally with the real model:

| Change judged | Stage 1 result | Time |
|---|---|---|
| the fix for #37, buggy version | FAIL, on the real defect: a save code made only of digits reached Sentry | 57 s |
| the fix for #37, final version | PASS, 6 of 6 | 46 s |
| the fix for #46 | PASS, 2 of 2; the old 5-minute timeout was answered NO | 4 s |
| the stage 1 pull request itself | PASS, 9 of 9 | 14 s |

## The builder owns the test plan

The test plan is two things: each pull request's `## QA checks`, and [test/past-failures.md](../test/past-failures.md). The builder writes both and keeps improving them.

**QA checks.** In the pull request description, under `## QA checks`, one line per thing the change could break. Two real lines from the stage 1 pull request:

```markdown
## QA checks
- [changes] tools/qa.js: In stage 1, does a check labelled [changes] fail when the model also answers YES on the code before the pull request?
- [stays] .github/workflows/ci.yml: Do the qa and qa-review jobs run only on pull requests into dev?
```

`[changes]` means "this change makes it true": YES on the new code, not YES on the old. `[stays]` means "this must still hold": YES on the new code. After the label come the files that hold the answer, then the question.

**Past failures.** Every failure that reached a player, `dev` or a review becomes a closed question, proven when it is added: NO on the code just before its fix, YES after, 3 runs out of 3. The file holds one line per past failure. Stage 1 asks a line again whenever a pull request touches a file it names, so a bug that was fixed once cannot quietly come back. A real line:

```markdown
- [#3] index.html: Is every Aorta level subtitle free of any claim that the blood or the current carries pathogens toward the heart (the aorta carries blood away from the heart)?
```

**What makes a good check**, and why:

| Rule | Why |
|---|---|
| Ask one fact, phrased so YES means right | the agent answers a single YES or NO; two facts in one question give an answer that means neither |
| Ask about behaviour, never "does X appear" | text can be in the file and still never run |
| Say where: "sent to Sentry", not "sent" | an unqualified verb can be true somewhere else in the code |
| Use `[changes]` only if this change makes it true | what was already true is `[stays]`; a `[changes]` check already YES on the old code fails |
| Name the files that hold the answer | the agent sees only those files, not library defaults or the rest of the repository |

When a check misbehaves (a 2-1 vote, a wrong FAIL, a bug that got through), the builder rewrites the question or adds a past failure, and writes the lesson into [AGENTS.md](../AGENTS.md).

## The loop: what "continue" means

When the owner says **continue**, the orchestrator runs one turn of this loop. The checklist is the [`team-loop` skill](../.claude/skills/team-loop/SKILL.md); it is not named `continue` because `/continue` is a built-in Claude Code command.

1. **Triage.** Read the open issues and anything learned since the last turn: test output, QA findings, the owner's feedback. New work becomes an issue with a priority (`P0` breaks play or teaches wrong biology, `P1` next thing the owner asked for, `P2` planned, `P3` polish, `P4` someday) and a type.
2. **Spec.** The next issue gets its spec, in the issue itself or a **Spec** comment: why, what changes, acceptance criteria (statements anyone can check), out of scope. The orchestrator settles design questions, or runs a panel when the options are wide. Anything that needs the owner is labelled `needs-owner` and waits.
3. **Build.** The orchestrator builds it on a branch `issue/<n>-<slug>`, runs the checks (`npm test`; `npm run test:game` for game changes; the balance bot for gameplay) and tries the change live.
4. **Open the pull request** into `dev`, with its `## QA checks`. A bug fix also adds its past failure. The orchestrator arms auto-merge at once: `sh tools/automerge.sh <n>`.
5. **Verify.** CI runs `test`, `game`, `qa` and `qa-review`. A red `test`, `game` or `qa` blocks the merge and the work goes back to the builder. The orchestrator reads `qa-review` and fixes or answers each finding.
6. **Integrate.** GitHub merges the pull request once `test`, `game` and `qa` are green, with no human. Render deploys the new `dev` commit, and CI's `deployed` job proves it is live.
7. **Report.** One short message to the owner: what shipped, what is not verified, what needs them.

**Promotion** is separate and needs the owner: every promotion of `dev` into `main` (production) needs the owner's written go; then the owner or, on that go, the orchestrator clicks merge. Each go is recorded in the [STATUS promotions table](STATUS.md#promotions). Issues close then, each with a "Shipped to production" comment. Until then a finished issue stays open, with the label `status:on-dev`.

## Gates

| Gate | Enforced by |
|---|---|
| `dev` changes only through a pull request whose `test`, `game` and `qa` passed | GitHub ruleset on `dev`; nobody can bypass it |
| `main` changes only through a pull request that is up to date, with `test` and `game` green and `dev`'s own CI run on the same commit green (`dev-green`) | GitHub ruleset on `main` and [promotion.yml](../.github/workflows/promotion.yml) |
| Every merge into `main` follows the owner's written go | the rule in [AGENTS.md](../AGENTS.md) and `tools/automerge.sh`, which refuses any base but `dev`. GitHub itself does not enforce who merges |
| Biology text is fun first, honest always: every bend of real biology carries an "In reality" note | the spec and the review of each change |

## Where to see it

The agents post through the owner's `gh` login, so on GitHub their comments show the owner's name. Tell them apart by their heading: **Spec (orchestrator)**, **Build notes**, **Engineer report**, **QA verdict** (the paused subagents, as in [this QA verdict](screenshots/proof/spec-qa-verdict.jpg)). The CI QA agent posts as `github-actions`, for example its [QA checks comment on the on-call fix](screenshots/proof/team-qa-on-oncall-pr.jpg).

| To see | Open |
|---|---|
| the backlog and priorities | [GitHub Issues](https://github.com/alexisdacquay/immune-citadel-v4/issues): labels `P0`-`P4`, type (`bug`, `type:feature`, `type:content`, `type:chore`, `type:design`), status, `needs-owner`, `roadmap` |
| a spec with acceptance criteria | any recent issue, for example [#47](https://github.com/alexisdacquay/immune-citadel-v4/issues/47) or [#37](https://github.com/alexisdacquay/immune-citadel-v4/issues/37) |
| a builder's test plan and both QA verdicts | the description and comments of any pull request into `dev`, for example the [QA checks comment on the on-call fix](screenshots/proof/team-qa-on-oncall-pr.jpg) |
| the past failures stage 1 keeps asking | [test/past-failures.md](../test/past-failures.md) |
| the older QA subagent's verdict on an issue | [#24](https://github.com/alexisdacquay/immune-citadel-v4/issues/24): [its spec](screenshots/proof/spec-issue-acceptance.jpg) and [the QA subagent's round-2 verdict](screenshots/proof/spec-qa-verdict.jpg) |
| which issue a commit belongs to | from 2026-11-12 on: the `(#n)` at the end of a commit message on `dev`, or the `issue/<n>-…` branch named in its merge commit. Earlier commits carry the original repository's numbers, which here are missing or name other items |

## Tools the team uses

| Tool | What it does |
|---|---|
| `tools/test.js` (`npm run test:game`) | the full browser suite: layout, saves, onboarding, every level played by a seeded bot, challenges, Memory, Field Guide, audio; it also runs `tools/touch.js` |
| `tools/touch.js` | phones, tablet and mouse sizes: real taps on every control, touch target sizes, HUD coverage |
| `tools/balance.js` | unseeded balance bot: `node tools/balance.js RUNS LEVELS none\|all` prints the vitality left per run |
| `tools/qa.js` | the QA agent, both stages |
| `tools/oncall.js` | the on-call agent: from a Sentry alert's issue to a tested fix pull request into `dev` |
| `tools/automerge.sh` | arms auto-merge on a pull request into `dev`, and refuses any other base |
| `tools/verify-deploy.js` | CI's `deployed` job: waits until Render serves the pushed commit |
| `tools/smoke.js` | CI's `deployed` job, next: plays the live site read-only and checks no player data reaches Sentry |

## Known gaps

- **A pull request that edits `ci.yml` can change its own `qa` job,** because GitHub reads the workflow file from the pull request. Not fixed yet.
- **The paused issue-cycle workflow** ([.claude/workflows/issue-cycle.js](../.claude/workflows/issue-cycle.js)) still sends bugs to `ic-bug-fixer` and verification to `ic-qa`, both paused. It is kept for reference and not run; the loop above, in the [`team-loop` skill](../.claude/skills/team-loop/SKILL.md), is what the team does today.
