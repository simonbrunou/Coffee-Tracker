# Coffee-Tracker

## Agent skills

### Issue tracker

Forgejo issues on `git.sbrn.eu` via the `fj` CLI, with the REST API for JSON reads and blocking links. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

## Design checkpoints

Convene the council (`council` skill) before presenting any design or plan, fold its outcome in and note `Council review: ...`; `.claude/hooks/council-on-plan.sh` enforces this on `ExitPlanMode` only.

## Dependency holds

`npm outdated` lists these two as outdated. Keep them where they are:

- **eslint stays on 9** until `eslint-plugin-jsx-a11y`, `eslint-plugin-import` and `eslint-plugin-react` publish releases whose `eslint` peer range includes `^10`; their current latest releases stop at `^9`, so eslint 10 fails `npm ci` with ERESOLVE. Leave Renovate's eslint 10 PR (#72, which records the blocker scan) open: closing it makes Renovate stop proposing v10.
- **next-auth stays on the v5 beta** (`next-auth@beta`). npm's `latest` tag is the old v4 line, so a 4.x "upgrade" is a downgrade.
