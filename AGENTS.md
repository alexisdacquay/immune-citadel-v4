# Immune Citadel v4

A Kingdom Rush-style tower defense inside the human body, for teens (12-15); education first. The whole game is `index.html` (vanilla JS canvas). The save API lives in `server/`.

- **Docs:** `README.md` (what and how to run), `docs/SPEC.md` (player journeys, acceptance criteria), `docs/TEAM.md` (agent team and loop), `docs/OPERATIONS.md` (environments, releases, telemetry, alert).
- **Team:** the main session builds and checks everything; the `ic-bug-fixer` and `ic-qa` agents are paused by the owner.
- **"continue"** from the owner means one turn of the team loop: use the `team-loop` skill.
- **Branches:** `issue/<n>-<slug>` = one issue's work, merged into `dev` by pull request. Render deploys `dev` (dev site) and `main` (production) only after CI passes; the `dev` -> `main` pull request is the production gate and only the owner merges it.
- **Checks:** `npm test` (fast tests, then integration on the Docker stack); `npm run test:game` for game changes; `node tools/balance.js 10 <specimens> none` for gameplay balance.
- **Text rules:** immune-system vocabulary on screen (no magic, armor, spell, tower); kid-level; honest biology, with an "In reality" note on every bend.
- `sed -i` is blocked in the agents' shell: edit with the Edit tool or a python heredoc that asserts each match.
