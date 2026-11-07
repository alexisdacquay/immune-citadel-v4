#!/bin/sh
# Arm GitHub auto-merge on a pull request into dev: GitHub merges it once test, game and qa pass.
# Refuses every other base: production (main) is merged by the owner only. Claude Code may run this without asking (.claude/settings.json).
set -eu
[ "$#" -eq 1 ] || { echo 'usage: sh tools/automerge.sh <pull request number>' >&2; exit 2; }
base=$(gh pr view "$1" --json baseRefName -q .baseRefName)
[ "$base" = dev ] || { echo "refused: pull request #$1 targets $base; only the owner merges into $base" >&2; exit 1; }
gh pr merge "$1" --auto --merge
