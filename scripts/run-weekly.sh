#!/bin/zsh
# launchd entry point: run the weekly workflow; notify when the run or any allowed-failure step failed.
cd "${0:A:h}/.."
out=$(~/.local/bin/swamp workflow run local-ai-usage-weekly --repo-dir "$PWD" --json --no-color 2>&1)
rc=$?
print -r -- "$(date '+%F %T') rc=$rc"
print -r -- "$out"
if (( rc != 0 )) || print -r -- "$out" | grep -q '"status": *"failed"'; then
  osascript -e 'display notification "See ~/Library/Logs/local-ai-usage.log" with title "local-ai-usage: a step failed"'
fi
exit $rc
