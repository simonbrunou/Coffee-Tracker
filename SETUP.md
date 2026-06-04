# Dev environment (portable)

This repo carries its Claude Code tooling so a new machine needs minimal setup. Three layers, three mechanisms:

| Layer | Mechanism | On a fresh clone |
|-------|-----------|------------------|
| **Skills** (29) | **Vendored** as files in `.agents/skills/` | Present immediately — zero install |
| **Plugins** (23) | `enabledPlugins` in `.claude/settings.json` + `scripts/restore-claude-env.sh` | Run the script once (installs from marketplaces) |
| **MCPs** | `.mcp.json` (`shadcn`, `postgres`) + plugin-bundled servers | Approve on first launch; runtimes as noted |

## New machine — one-time

```bash
git clone git@github.com:simonbrunou/Coffee-Tracker.git && cd Coffee-Tracker
./scripts/restore-claude-env.sh          # plugins at user scope (use `project` to scope to this repo)
claude                                    # approve the shadcn + postgres MCP prompts
```

Restart Claude Code afterward so the plugins load.

## What's where

- **Vendored skills** (`.agents/skills/`): the Vercel React/Next set + shadcn/Tailwind, plus your general toolkit — `council`, `graphify`, `database*`, `postgresql-*`, `supabase-postgres-best-practices`, `typescript-advanced-types`, `*-testing`, `webapp-testing`, `performance`, `ci-cd-and-automation`, `docker-expert`, `find-skills`, `diagnose-ci-failures`, `resolve-merge-conflicts`, `respond-to-pr-comments-in-blocklist`, `pr-walkthrough`, `design-motion-principles`, `i18n-localization`, `bun-*`. Edit/update them like any file (they are snapshots — not tracked in `skills-lock.json`).
- **Plugins** (`scripts/restore-claude-env.sh`): superpowers, frontend-design, impeccable, ui-ux-pro-max, context7, code-review, code-simplifier, github, playwright, feature-dev, claude-md-management, typescript-lsp, security-guidance, commit-commands, pr-review-toolkit, chrome-devtools-mcp, skill-creator, hookify, plugin-dev, claude-code-setup, coderabbit, sentry, cloudflare.
- **Project skills/agent/hooks** (`.claude/`): `/migration`, `/gen-test`, the `security-reviewer` agent, and the block-secrets / format-edited / code-review-on-push / graphify hooks.

## Not portable (by design)
- `graphify` **CLI** (the skill is vendored; the binary installs separately).
- The **postgres** MCP needs Docker + a running Postgres at the `.mcp.json` `DATABASE_URI`.
- **claude.ai account MCPs** (Gmail, Drive, Canva, Calendar, PayPal) follow your login, not the repo.
- MCP **approvals** are always per-machine (security).

> Excluded as off-stack for this React/Next.js + Postgres project: the `svelte` / `sveltekit-structure` and `pgmicro-postgres-sqlite` / `discord` tooling. Add them manually if ever needed.
