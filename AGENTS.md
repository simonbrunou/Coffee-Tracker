# Coffee-Tracker

## Agent skills

### Issue tracker

Forgejo issues on `git.sbrn.eu` via the `fj` CLI, with the REST API for JSON reads and blocking links. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Design checkpoints

Before presenting a non-trivial design or plan, run the `council` skill (vendored in `.agents/skills/council/`), fold in its result and note `Council review: …` (`Council review: n/a` for trivial or mechanical work). In Claude Code, `.claude/hooks/council-on-plan.sh` blocks `ExitPlanMode` until the plan mentions the council; a design presented outside plan mode triggers no hook, so this rule is what covers it.

## Dependency holds

Before bumping a dependency or acting on a Renovate PR, read `docs/agents/dependencies.md`: eslint, TypeScript and next-auth are held below npm `latest` on purpose.

## Merge authority

An AI agent merges its own PR, or a Renovate PR that moves no package off its hold in `docs/agents/dependencies.md`, with `fj pr -R origin merge <n> -d`, when every changed path is under `components/`, `public/`, `test/` or `docs/` outside `docs/agents/`, or is `README.md` or `package-lock.json`. It does so once a code review ran on the diff (the `code-review` skill), its real findings are fixed, nits aside, every CI check is green on the pushed SHA and the PR has no conflict with `origin/main`. An agent leaves a PR that touches any other path (`app/`, `lib/`, `drizzle/`, `scripts/`, `.forgejo/`, `docs/agents/`, `package.json`, the `Dockerfile`, `renovate.json`, this file) for the user to merge. Renovate's own automerge follows `renovate.json`.

No Coolify app builds this repo (read from Coolify's database on 2026-11-23), so a merge deploys nothing. `docs/DEPLOY.md` names Coolify as the target: when an app is created, add its deploy check here.
