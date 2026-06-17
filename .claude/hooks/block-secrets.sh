#!/usr/bin/env bash
# PreToolUse(Write|Edit): keep secrets out of tracked files.
# Secrets live in gitignored .env.local/.env.test; only .env.example (placeholders)
# is tracked. CI uses the literal "ci-build-placeholder-not-a-secret" for AUTH_SECRET,
# so .example files are always allowed.
input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
content=$(printf '%s' "$input" | jq -r '.tool_input.content // .tool_input.new_string // empty' 2>/dev/null)
deny(){ jq -n --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'; exit 0; }

# Block writing a real env file (only *.example is tracked).
case "$path" in
  *.example) : ;;
  */.env|*/.env.*|.env|.env.*) deny "Refusing to write a real env file ($path). Secrets belong in gitignored .env.local/.env.test; only .env.example (placeholders) is tracked." ;;
esac

# Block obvious live secrets in any file (Resend keys, AUTH/DATABASE secrets with real values).
printf '%s' "$content" | grep -Eq 're_[A-Za-z0-9]{20,}' && deny "A live Resend API key (re_...) must never be written to a tracked file — put it in .env.local."
printf '%s' "$content" | grep -Eq 'postgres(ql)?://[^:@/]+:[^@/]+@' && deny "A Postgres URL with embedded credentials was detected — keep connection strings with real creds in .env.local, not a tracked file."
exit 0
