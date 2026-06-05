#!/usr/bin/env bash
# PreToolUse(ExitPlanMode): gate plans through a council pass.
# Allows the plan if it already shows a council review; otherwise denies with a
# reason telling the agent to convene the council skill first. Escape hatch:
# a "Council review: n/a" line lets a trivial/mechanical plan through.
PLAN=$(python3 -c 'import json,sys
d=json.load(sys.stdin)
ti=d.get("tool_input",{})
print(ti.get("plan") or ti.get("message") or json.dumps(ti))' 2>/dev/null | tr 'A-Z' 'a-z')

case "$PLAN" in
  *council*) exit 0 ;;
esac

cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Design/plan checkpoint: convene the council skill to pressure-test this plan (model-diverse subagents -> reconcile -> synthesize) before presenting it, then add a short 'Council review: ...' note to the plan and retry. If a council pass is genuinely unwarranted (a trivial or mechanical plan), add a 'Council review: n/a' line to proceed."}}
JSON
