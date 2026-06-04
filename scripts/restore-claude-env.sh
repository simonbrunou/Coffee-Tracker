#!/usr/bin/env bash
#
# Restore this repo's Claude Code dev environment on a new machine.
#
# WHAT TRAVELS HOW
#   • Skills  -> vendored as files in .agents/skills/ (29 skills). Nothing to do;
#                they are present the moment you clone.
#   • Plugins -> NOT file-vendorable. This script registers their marketplaces and
#                installs each one (they are also listed in .claude/settings.json
#                `enabledPlugins`, so Claude Code enables them for this project).
#   • MCPs    -> shadcn + postgres live in .mcp.json (you'll be prompted to approve
#                them on first launch). The context7 / github / playwright /
#                chrome-devtools / sentry / cloudflare MCP servers are bundled inside
#                the plugins below, so they return automatically once the plugins are
#                installed. claude.ai MCPs (Gmail, Drive, …) follow your account login.
#
# USAGE
#   ./scripts/restore-claude-env.sh           # install plugins at user scope (default)
#   ./scripts/restore-claude-env.sh project   # install plugins scoped to this project
#
set -uo pipefail

command -v claude >/dev/null 2>&1 || { echo "ERROR: 'claude' CLI not found in PATH."; exit 1; }

SCOPE="${1:-user}"

echo "==> Registering plugin marketplaces"
claude plugin marketplace add anthropics/claude-plugins-official   2>/dev/null || true
claude plugin marketplace add pbakaus/impeccable                   2>/dev/null || true
claude plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill 2>/dev/null || true

# Plugins from the official Anthropic marketplace.
OFFICIAL=(
  superpowers frontend-design context7 code-review code-simplifier github
  playwright feature-dev claude-md-management typescript-lsp security-guidance
  commit-commands pr-review-toolkit chrome-devtools-mcp skill-creator hookify
  plugin-dev claude-code-setup coderabbit sentry cloudflare
)

echo "==> Installing ${#OFFICIAL[@]} official-marketplace plugins (scope: $SCOPE)"
for p in "${OFFICIAL[@]}"; do
  printf '  - %-22s ' "$p"
  claude plugin install "$p@claude-plugins-official" --scope "$SCOPE" >/dev/null 2>&1 \
    && echo "ok" || echo "FAILED"
done

echo "==> Installing community-marketplace plugins (scope: $SCOPE)"
for spec in "impeccable@impeccable" "ui-ux-pro-max@ui-ux-pro-max-skill"; do
  printf '  - %-22s ' "${spec%@*}"
  claude plugin install "$spec" --scope "$SCOPE" >/dev/null 2>&1 \
    && echo "ok" || echo "FAILED"
done

cat <<'NOTES'

==> Done.
  • 29 skills are already vendored in .agents/skills/ — no reinstall needed.
  • Approve the shadcn + postgres MCP servers when Claude Code prompts (.mcp.json).
  • The `graphify` skill needs the `graphify` CLI installed separately to actually run.
  • The postgres MCP also needs Docker + a Postgres reachable at the .mcp.json DATABASE_URI.
  • Restart Claude Code so the newly installed plugins load.
NOTES
