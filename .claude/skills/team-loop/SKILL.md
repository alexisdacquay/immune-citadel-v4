---
name: team-loop
description: Run the Immune Citadel team loop when the owner says "continue" (or "next", "keep going", "what is next") in the immune-citadel-v4 project, or types /team-loop. Triage the GitHub backlog, spec the top issue, route it (bugs to ic-bug-fixer, everything else built by the orchestrator), have ic-qa verify it through the issue-cycle workflow, integrate into dev and report.
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
Route by the issue's type label:
- **`bug`:** run the saved workflow `issue-cycle` with args `{ "issue": <n>, "slug": "<short-slug>" }`. It runs `ic-bug-fixer`, then `ic-qa`, and loops back to the bug-fixer at most twice on a FAIL. Do not fix the bug yourself.
- **Everything else** (feature, content, design, balance, chore, anything touching how the game teaches): build it yourself on branch `issue/<n>-<slug>`, run the checks, post a short **Build notes** comment, then run `issue-cycle` with `"qaOnly": true`. On a FAIL, fix it yourself and run QA again.
- Add `"roleFiles": true` when this session did not start in the repo (the agent types are then not registered).
- Never verify your own work in place of `ic-qa`; if the workflow fails, find the root cause before retrying.

## 4. Integrate
- On a PASS: read the diff yourself (`git diff dev...issue/<n>-<slug>`). If you disagree with something, send it back with a comment instead of patching it silently.
- Open (or reuse) the pull request from `issue/<n>-<slug>` into `dev`, wait for CI to pass, merge it (`gh pr merge --merge`), confirm the dev site serves the change, label `status:on-dev`, and post a one-line **Integrated** comment with the commit.
- On a second FAIL: label `needs-owner` or re-spec; never merge a failing issue.

## 5. Report
Tell the owner in a few lines: what shipped (issue links), what is not verified, what needs them. Then, if the owner asked for more than one cycle, go back to step 1.

## Gates
- Never touch `main` without the owner's explicit approval in the current conversation.
- Pushing `dev` is allowed after a PASS when the owner has pre-approved dev pushes; otherwise ask.
