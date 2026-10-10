#!/bin/sh
# Last workflow step: commit public/summary.json and prices.yaml when they changed, then push if a remote exists.
set -eu
cd "$(dirname "$0")/.."
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "not on main; refusing to publish" >&2; exit 1; }
git add public/summary.json prices.yaml
if git diff --cached --quiet -- public/summary.json prices.yaml; then
  echo "no change"
else
  week=$(plutil -extract weeks.0.week raw -o - public/summary.json)
  git commit -q -m "chore(data): weekly summary $week" -- public/summary.json prices.yaml
fi
# Push even with no change, so a commit whose push failed on an earlier run goes out now.
if git remote get-url origin >/dev/null 2>&1; then
  git push -q origin main
else
  echo "no origin remote; not pushed"
fi
