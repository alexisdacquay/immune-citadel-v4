# Agent team and process

Immune Citadel v4 is built by a small team of AI agents and one human owner. This page defines who does what, how work flows, and where every step leaves a trace. It describes how the game has actually been built since P0; it does not invent a new process.

## The team

| Role | Who | Model | Owns | Never does |
|---|---|---|---|---|
| **Owner** | the human | | priorities, approvals, playtests, production releases | |
| **Orchestrator** (PM, game designer, builder, integrator) | the main Claude Code session | the session's model | the backlog, issue specs and acceptance criteria, design decisions, building every non-bug issue, the final diff review, auto-merge into `dev`, reports to the owner | merge to `main` (production) without the owner's word |
| **Bug-fixer** | subagent `ic-bug-fixer` ([role](../.claude/agents/ic-bug-fixer.md)) | Opus | fixing one `bug` issue on its own branch, running the test suites, an engineer report | build anything that is not a bug, choose priorities, change scope, merge |
| **QA** | CI jobs `qa` and `qa-review` ([tools/qa.js](../tools/qa.js)), on every pull request into `dev` | DeepSeek `deepseek-flash` | `qa` (stage 1): closed questions, each answered YES or NO at low effort from the files it names: the builder's **QA checks** in the pull request and the past failures ([test/past-failures.md](../test/past-failures.md)) in the files it changes; a **QA checks** comment, required, so a FAIL blocks the merge. `qa-review`: the open review, a **QA review (advisory)** comment that never blocks; its findings are fixed or answered before a promotion | edit code, see the builder's reasoning |
| **Panels** | groups of short-lived subagents run as a workflow | Opus | wide questions one agent should not answer alone: design options (designers + judges), audits (finders + independent verifiers) | decide; a panel returns options and evidence, the orchestrator decides |

Why this split: a bug has an objective pass/fail, so handing it to a bug-fixer and checking it with independent QA is safe. Design, content and balance carry intent that is lost in a handoff, so the orchestrator builds them, and QA still verifies them independently. The game is one file, so parallel builders would collide.

## The loop: what "continue" means

When the owner says **continue**, the orchestrator runs this loop. The [`team-loop` skill](../.claude/skills/team-loop/SKILL.md) holds the checklist; it is not named `continue` because `/continue` is a built-in Claude Code command.

1. **Triage.** Read the open issues and anything learned since the last cycle (test output, QA findings, owner feedback). New work becomes an issue. Every issue gets a priority (`P0` bug that breaks play or teaches wrong biology, `P1` next feature the owner asked for, `P2` planned, `P3` polish, `P4` someday), a type, and a status.
2. **Spec.** The top `status:ready` issue gets a **Spec** comment: why, what changes, acceptance criteria (checkable statements), out of scope. Design questions are settled here, by the orchestrator, or by a panel when the space is wide. Anything that needs the owner gets `needs-owner` and waits.
3. **Build.** Routed by type. A `bug`: the [issue-cycle workflow](../.claude/workflows/issue-cycle.js) starts an `ic-bug-fixer` on a branch `issue/<n>-<slug>`; it posts an **Engineer report** comment. Anything else: the orchestrator builds it on that branch and posts **Build notes**.
4. **Verify.** The builder writes the pull request's **QA checks**: what the change could break, as closed questions. CI's `qa` job asks each one, and the past failures in the files the change touches, of the code itself, not of the builder's reasoning, and posts a **QA checks** comment: YES or NO per question, with the deciding line. A `[changes]` check that is already YES on the old code does not test the change and fails. A FAIL blocks the merge and goes back to whoever built it. `qa-review` posts the open review next to it, advisory; the orchestrator reads it and fixes or answers each finding before asking for a promotion.
5. **Integrate.** The orchestrator arms auto-merge as soon as it opens the pull request (`sh tools/automerge.sh <n>`); GitHub merges when `test`, `game` and `qa` pass, with no human. When CI's `deployed` job is green on `dev`, the issue gets `status:on-dev`.
6. **Report.** One short message to the owner: what shipped, what is not verified, what needs them.

Issues close when `dev` is promoted to `main`, which only the owner approves.

## Where to see it

Everything the team does leaves a trace on GitHub, so the process is visible without reading chat logs:

- **Issues** are the backlog. Labels: priority `P0`-`P4`, type (`bug`, `type:feature`, `type:content`, `type:chore`, `type:design`), status (`status:ready`, `status:in-progress`, `status:in-qa`, `status:on-dev`), and `needs-owner`.
- **Issue comments** carry the Spec, the Engineer report and the QA verdict, in that order.
- **Pull requests** from `issue/<n>-<slug>` into `dev`, each with its CI run.
- **Commits** on `dev` reference their issue (`(#n)`).

## Gates

- Production (`main`) changes only with the owner's explicit approval.
- `dev` changes only through a pull request that GitHub auto-merges once `test`, `game` and `qa` pass; no human merges into `dev`.
- Every gameplay change runs the balance bot (`node tools/balance.js`); every change runs `node tools/test.js` and `node tools/touch.js`.
- Biology text follows Rule #1: fun first, honest always. A bend of the real biology carries an "In reality" note.

## Tools the team uses

- `tools/test.js`: full browser suite (layout, saves, onboarding, every specimen played by a seeded bot, challenges, Memory, Field Guide, audio).
- `tools/touch.js`: phones, tablet, touch targets, HUD coverage.
- `tools/balance.js`: unseeded balance bot; `node tools/balance.js RUNS LEVELS none|all` prints the vitality left per run. Env `C='9:.85'` overrides campaign pathogen health per specimen.
