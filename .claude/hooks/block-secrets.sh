#!/usr/bin/env bash
# PreToolUse(Write|Edit): deny agent edits to secret files (.env*, private keys,
# certs). Template files (.env.example / .env.test) remain editable.
FILE=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
case "$FILE" in
  *.env.example | *.env.test) exit 0 ;;
  *.env | *.env.* | *.pem | *.key | *id_rsa* | *id_ed25519*)
    cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Blocked by project policy: secret files (.env*, private keys, certs) must not be modified by the agent. Edit them by hand if genuinely required."}}
JSON
    ;;
esac
exit 0
