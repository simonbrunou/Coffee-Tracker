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

## Authentication

Cortado uses [Auth.js v5](https://authjs.dev) (the `next-auth@beta` package). Before running the app you need a few env vars in `.env.local` (never committed — add it to your `.gitignore` if it isn't already):

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | Signing / encryption secret for sessions and JWTs. **Required.** |
| `AUTH_GOOGLE_ID` | Google OAuth client ID. |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret. |
| `AUTH_GITHUB_ID` | GitHub OAuth App client ID. |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App client secret. |
| `AUTH_URL` | Full origin URL (`https://your-host/`). Leave unset for localhost (`trustHost` is enabled). |

See `.env.example` at the repo root for a copy-paste template.

### Generating `AUTH_SECRET`

```bash
npx auth secret        # writes AUTH_SECRET= to .env.local automatically
# — or —
openssl rand -base64 33
```

### Registering OAuth providers

**Google** — [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials → Create OAuth client:
- Authorized redirect URI: `<origin>/api/auth/callback/google`

**GitHub** — [github.com/settings/developers](https://github.com/settings/developers) → New OAuth App:
- Authorization callback URL: `<origin>/api/auth/callback/github`

For local dev, `<origin>` is `http://localhost:3000`. Real secrets go in `.env.local` only — do **not** commit them.

## Database & migrations (Drizzle)

Schema is managed by **Drizzle + drizzle-kit**; the source of truth is `lib/db/schema.ts` → `drizzle/`. Runtime queries still use raw `pg`.

```bash
npm run db:setup     # apply migrations (additive, NON-destructive) + seed if empty
npm run db:reset     # DESTRUCTIVE: drop schema + re-migrate + seed
```

To change the schema: edit `lib/db/schema.ts`, run `npx drizzle-kit generate`, review the new `drizzle/NNNN_*.sql`, then `npm run db:setup`. (See the `/migration` skill.) `db/schema.sql` is a frozen pre-Drizzle snapshot kept only as the fidelity oracle — do not edit it.

## Integration tests (real Postgres)

```bash
docker exec coffee-pg createdb -U postgres coffee_tracker_test   # one-time
npm run test:integration                                          # fidelity gate + constraint tests
```

`npm test` runs the DB-less unit suite plus the integration tests when a test DB is available (`.env.test` locally, or `DATABASE_URL` in CI); without one, the integration tests self-skip.
