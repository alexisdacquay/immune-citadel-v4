---
name: team-loop
description: Run the Immune Citadel team loop when the owner says "continue" (or "next", "keep going", "what is next") in the immune-citadel-v4 project, or types /team-loop. Triage the GitHub backlog, spec the top issue, build it with its QA checks, let CI's QA agent verify it, integrate into dev and report.
---

# team-loop: one turn of the team loop (what "continue" means)

The process and roles are defined in `docs/TEAM.md`. This is the orchestrator's checklist. You are the orchestrator: PM, game designer and integrator. You decide; agents build and verify.

## 1. Triage (always)
- `gh issue list --state open --limit 100 --json number,title,labels` and read anything new since the last cycle (owner messages, QA findings, test output, deploy state).
- Every new finding becomes an issue with a priority (`P0`-`P4`), a type label and a status label. Comment on stale issues instead of silently changing them.
- Order of work: `P0` first, then the owner's latest stated priority, then `P1`, `P2`. Skip `needs-owner` issues and say which ones wait.

## 2. Spec (one issue)
- Pick the top `status:ready` issue. If it has no **Spec** comment, write one: Why · What changes · Acceptance criteria (checkable, each one a sentence QA can test) · Out of scope · Checks to run.
- Decide design questions yourself (think, then decide; state the reason in one line). For wide questions run a panel workflow (independent designers, then judges) before deciding.
- If the decision belongs to the owner (scope, priorities, anything costly or irreversible), label `needs-owner`, ask once in your report, and move on to the next issue.
- Label the issue `status:in-progress`.

## 3. Build and verify
- The `ic-bug-fixer` and `ic-qa` agents and the `issue-cycle` workflow are paused by the owner: the orchestrator builds every issue, bugs included, on branch `issue/<n>-<slug>`, runs `npm test` (and `npm run test:game` when the game changes) and posts a short **Build notes** comment.
- Write the pull request's `## QA checks` (AGENTS.md, **Test plan**): what the change could break, as closed questions, at least one `[changes]`. A bug fix also adds its line to `test/past-failures.md`, proven NO on the code before the fix and YES after.
- QA runs in CI on the pull request: stage 1 `qa` (required) asks those questions and the past failures in the files the change touches; stage 2 `qa-review` is the open review, advisory.

## 4. Integrate
- Read the diff yourself before opening the pull request into `dev`; arm auto-merge right away with `sh tools/automerge.sh <n>`. GitHub merges once `test`, `game` and `qa` are green.
- On a stage 1 FAIL: a real defect, fix it; a wrong answer, rewrite the question and add the lesson to AGENTS.md. Fix or answer every `qa-review` finding before the next promotion.
- Once the pull request merges into `dev`, close the issue with "Fixed by #<pr> on dev; it reaches production with the next promotion."
- At a promotion, the pull request lists what it brings; once it merges, each issue it ships gets "Shipped to production in #<promotion> (<commit>)".

## 5. Report
Tell the owner in a few lines: what shipped (issue links), what is not verified, what needs them. Then, if the owner asked for more than one cycle, go back to step 1.

## Gates
- Production is manual: a promotion pull request (`dev` → `main`) is merged only on the owner's go for that release; nothing merges into `main` automatically. Never merge into `main`, or arm auto-merge on it, without that go in the current conversation.
