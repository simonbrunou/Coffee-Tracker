#!/usr/bin/env bash
# PreToolUse(Write|Edit): block edits to applied Drizzle migrations + meta.
# drizzle/*.sql and drizzle/meta/* are immutable once committed — scripts/migrate.mts
# replays them in prod against recorded _journal.json hashes, and CI drift-checks them.
# To change the schema, edit lib/db/schema.ts and run `npx drizzle-kit generate`.
input=$(cat)
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
case "$path" in
  */drizzle/*.sql|*/drizzle/meta/*|drizzle/*.sql|drizzle/meta/*)
    jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"Refusing to edit an applied Drizzle migration. drizzle/*.sql and drizzle/meta/* are immutable (replayed in prod by scripts/migrate.mts; CI drift-checks them). To change the schema, edit lib/db/schema.ts and run `npx drizzle-kit generate` to create a NEW migration."}}'
    ;;
esac
exit 0
