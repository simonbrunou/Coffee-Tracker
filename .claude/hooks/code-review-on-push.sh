#!/usr/bin/env bash
# PostToolUse(Bash) hook. Self-gating: it reads the tool call on stdin and only
# acts when the command is an actual `git push` or `gh pr create` — so it no
# longer fires on every Bash command (gh pr comment, tsc, curl, pkill, …). It is
# wired as a SINGLE Bash entry in .claude/settings.json (no `"if"` clause, which
# was not filtering reliably and also caused double-fires from two entries).
#
# When the current branch has an OPEN pull request, it injects an instruction
# back to Claude to run the agent-based /code-review on that PR.
set -euo pipefail

# The command that just ran (PostToolUse stdin: {tool_input:{command:"..."}}).
CMD=$(python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || true)

# Only proceed for `git push` / `gh pr create` at a command position (start of a
# line, or after ; & | ( ), so the same words inside a commit/PR-comment body
# don't trigger it. grep matches per line, which also catches a push on its own
# line in a multi-line command.
if ! printf '%s' "$CMD" | grep -Eq '(^|[;&|(])[[:space:]]*(git[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+create)([[:space:]]|$)'; then
	exit 0
fi

# Current branch's PR as "<number> <url>", only when OPEN. `gh pr view` exits
# non-zero when the branch has no PR → the hook silently no-ops.
info=$(gh pr view --json number,url,state -q 'select(.state=="OPEN") | "\(.number) \(.url)"' 2>/dev/null) || exit 0
[ -n "$info" ] || exit 0

num=${info%% *}
url=${info#* }
ctx="A git push / PR open just landed on PR #${num} (${url}). Per the user's standing request, run /code-review on PR #${num} now, then post the summary comment to the PR."

# Emit PostToolUse additionalContext (JSON-escaped via python3 for safety).
printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":%s}}\n' \
	"$(printf '%s' "$ctx" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
