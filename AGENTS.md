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
