---
name: team-loop
description: Run the Immune Citadel team loop when the owner says "continue" (or "next", "keep going", "what is next") in the immune-citadel-v4 project, or types /team-loop. Triage the GitHub backlog, spec the top issue, have ic-engineer build it and ic-qa verify it through the issue-cycle workflow, integrate into dev and report.
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
- Run the saved workflow `issue-cycle` with args `{ "issue": <n>, "slug": "<short-slug>" }` (add `"roleFiles": true` when this session did not start in the repo, so `ic-engineer` and `ic-qa` are not registered agent types). It runs `ic-engineer`, then `ic-qa`, and loops back to the engineer at most twice on a FAIL. Each agent posts its own comment on the issue.
- Do not do the engineer's or QA's work yourself; if the workflow fails, find the root cause before retrying.

## 4. Integrate
- On a PASS: read the diff yourself (`git diff dev...issue/<n>-<slug>`). If you disagree with something, send it back with a comment instead of patching it silently.
- Merge into `dev` (no fast-forward), push, confirm the dev site serves the change, label `status:on-dev`, and post a one-line **Integrated** comment with the commit.
- On a second FAIL: label `needs-owner` or re-spec; never merge a failing issue.

## 5. Report
Tell the owner in a few lines: what shipped (issue links), what is not verified, what needs them. Then, if the owner asked for more than one cycle, go back to step 1.

## Gates
- Never touch `main` without the owner's explicit approval in the current conversation.
- Pushing `dev` is allowed after a PASS when the owner has pre-approved dev pushes; otherwise ask.
