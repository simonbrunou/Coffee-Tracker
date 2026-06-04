#!/usr/bin/env bash
# PostToolUse(Write|Edit): format the just-edited file with Prettier when it is
# available. Uses --no-install so it silently no-ops until the project adds
# Prettier (e.g. after scaffolding) — never triggers a surprise install.
FILE=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" 2>/dev/null)
[ -z "$FILE" ] && exit 0
case "$FILE" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.json | *.jsonc | *.css | *.scss | *.html | *.md | *.mdx) ;;
  *) exit 0 ;;
esac
[ -f "$FILE" ] || exit 0

ROOT="${CLAUDE_PROJECT_DIR:-.}"
# Prefer the project's local Prettier; fall back to npx, then bunx.
if [ -x "$ROOT/node_modules/.bin/prettier" ]; then
  "$ROOT/node_modules/.bin/prettier" --write --log-level warn "$FILE" >/dev/null 2>&1
elif command -v npx >/dev/null 2>&1; then
  npx --no-install prettier --write --log-level warn "$FILE" >/dev/null 2>&1
elif command -v bunx >/dev/null 2>&1; then
  bunx prettier --write --log-level warn "$FILE" >/dev/null 2>&1
fi
exit 0
