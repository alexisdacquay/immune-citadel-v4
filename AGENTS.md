# Immune Citadel v4

A Kingdom Rush-style tower defense inside the human body, for teens (12-15); education first. The whole game is `index.html` (vanilla JS canvas). The save API lives in `server/`.

- **Team and process:** `docs/TEAM.md`. The main session is the orchestrator (PM, game designer, builder, integrator). Agents `ic-bug-fixer` and `ic-qa` run on Opus.
- **Routing:** issues labelled `bug` → `ic-bug-fixer` builds, `ic-qa` verifies. Everything else (design, content, balance, chores, how the game teaches) → the orchestrator builds, `ic-qa` verifies. Every issue goes through GitHub with an independent QA verdict.
- **"continue"** from the owner means one turn of the team loop: use the `team-loop` skill.
- **Branches:** `issue/<n>-<slug>` = one issue's work, merged into `dev` by pull request. Render deploys `dev` (dev site) and `main` (production) only after CI passes; the `dev` -> `main` pull request is the production gate and only the owner merges it.
- **Checks:** `node tools/test.js <scratch-dir>`, `node tools/touch.js`, and for gameplay changes `node tools/balance.js 10 <specimens> none`.
- **Text rules:** immune-system vocabulary on screen (no magic, armor, spell, tower); kid-level; honest biology, with an "In reality" note on every bend.
- `sed -i` is blocked in the agents' shell: edit with the Edit tool or a python heredoc that asserts each match.
