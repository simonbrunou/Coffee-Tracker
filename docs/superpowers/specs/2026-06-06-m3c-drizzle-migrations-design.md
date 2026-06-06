# M3·C — Drizzle Migrations (schema/migrations only) — Design

**Date:** 2026-06-06
**Branch:** `feat/m3c-drizzle-migrations` (off `main` @ `97eee2c`, the M3·B merge)
**Milestone:** M3·C, third of M3's four sub-projects (A=CI ✅, B=Ops ✅, **C=Migrations**, D=Pagination).
**Approach (owner-locked):** Adopt **Drizzle + drizzle-kit for migrations and schema management only**. Runtime queries stay on raw `pg` (`query()`/`withTransaction`) — `lib/queries.ts`, `app/actions.ts`, `auth.ts`, `lib/users-repo.ts` are **never rewritten**. (This is the council contrarian's endorsed path: under "full ORM" the compute-on-read reads collapse into raw `sql\`\`` inside Drizzle anyway, paying the ORM cost for no read-path benefit.)
**Council:** the 3-member council (Drizzle-correctness — Opus; test/CI — Sonnet; contrarian/risk — Opus) pressure-tested the broader foundation; this migrations-only scope is a strict, lower-risk subset of what they reviewed, and the contrarian explicitly recommended it. No new council round needed.

---

## Goal

Replace the destructive, hand-applied `db/schema.sql` bootstrap with a real, additive migration system (Drizzle), and **prove with a hard CI gate that the Drizzle baseline is schema-equivalent to the battle-tested `db/schema.sql`** so the unchanged raw queries keep running against an identical schema. Fix the audit's P0: `db:setup` drops & recreates every table on every run, and `db:reset --reset` is a no-op (the script never reads argv).

**Non-goal:** changing any runtime query. The raw `pg` data layer and all ~94 existing tests are preserved as-is.

## Context

- `db/schema.sql` (158 lines, **11 tables**) is the current source of truth, applied by `scripts/db-setup.ts`, which **drops & recreates everything every run** and ignores `--reset` (no argv handling).
- `lib/db.ts` (post-M3·B) owns a hardened `pg` Pool + raw `query()`/`withTransaction`. **It is not modified by this work.**
- Tests: vitest, node env, `server-only` stubbed. The DB-coupled tests (source-grep on `lib/queries.ts`, mock-`query()`) **remain valid** because the raw SQL they assert is unchanged.
- A committed `/migration` skill already declares Drizzle + drizzle-kit as the intended convention.

---

## The load-bearing decisions

### Decision 1 — the **schema-fidelity gate** is the centerpiece

Because the raw queries continue to run against whatever the migrations produce, the Drizzle baseline must be schema-equivalent to `db/schema.sql` — a subtle divergence would silently break a live query. So C delivers `test/integration/schema-fidelity.test.ts`:
1. Create two scratch databases (`cortado_fidelity_drizzle`, `cortado_fidelity_sql`) via a client on the maintenance `postgres` db.
2. Apply the generated Drizzle baseline (`drizzle/0000_*.sql`) to the first; apply the frozen `db/schema.sql` to the second.
3. Compare schemas at the **catalog level** (deterministic, low-noise — not a raw `pg_dump` text diff):
   - **columns** — `information_schema.columns` → set of `(table, column, data_type, udt_name, is_nullable, column_default)` (catches `numeric`/`text`/`text[]`, nullability, defaults).
   - **constraints** — `pg_constraint` → set of `(conname, contype, pg_get_constraintdef(oid))` (catches CHECKs, UNIQUEs, and FK `ON DELETE` actions — cascade vs no-action — by full definition).
   - **indexes** — `pg_indexes` → set of `(indexname, indexdef)` (catches the **named partial functional unique index** `users_email_lower_uq` = `lower(email) WHERE password_hash IS NOT NULL` verbatim).
4. Assert the three sets are equal; drop both scratch DBs in teardown.

**This gate must be green before merge.** It is the one-time proof that adopting Drizzle migrations doesn't silently change the schema the app was built and tested against.

### Decision 2 — hand-author `schema.ts`, `generate`, then gate; do **not** `drizzle-kit pull`

`lib/db/schema.ts` is hand-authored (readable, intentional). `drizzle-kit generate` emits `drizzle/0000_*.sql`. Decision 1's catalog diff is the fidelity check. `pull` (introspect) is rejected — worse artifact, mangles partial-index/check expressions.

### Decision 3 — `lib/db.ts` and all runtime queries are untouched

No `db = drizzle(pool)` in the app. The only Drizzle **runtime** usage is `migrate()` inside `scripts/db-setup.ts` (a setup-local instance) and a client in the fidelity/constraint tests. (`numeric` read-modes are irrelevant — nothing reads through Drizzle; the generated DDL is plain `numeric`.)

### Decision 4 — `db:setup` becomes non-destructive; `--reset` actually works

Fixes the audit P0 (the destructive bootstrap + ignored argv).

---

## Components

### 1. Dependencies
`drizzle-orm`, `drizzle-kit` (dev). No new runtime deps (`dotenv` already present).

### 2. `drizzle.config.ts`
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

### 3. `lib/db/schema.ts` — hand-authored mirror (DDL source for drizzle-kit only)
Mirror all 11 tables so the generated DDL equals `db/schema.sql`. Council-flagged specifics:
- **Named partial functional unique index** (pin the name — `register-errors.ts` branches on `err.constraint === "users_email_lower_uq"`):
  ```ts
  export const lower = (c: AnyPgColumn) => sql`lower(${c})`;
  uniqueIndex("users_email_lower_uq").on(lower(t.email)).where(sql`${t.passwordHash} is not null`)
  ```
  (drizzle-kit `generate` — unlike `push` — supports partial/expression indexes.)
- **CHECK constraints** via `check(name, sql\`…\`)` with Postgres-convention names: `beans_owned_has_owner`, `tastings_rating_check` (`rating between 1 and 5`), `no_self_follow` (`follower_id <> followee_id`), `comments_body_check` (`char_length(body) between 1 and 500`).
- **Non-cascade FKs**: `tastings.user_id → users(id)` and `beans.roaster_id → roasters(id)` use `.references(() => x.id)` with **no `onDelete`**; every other FK uses `{ onDelete: "cascade" }`.
- `numeric(...)` for `price`/`avg_rating`/`sca_score`/`remaining`; `integer(...)` for the int columns. (No `mode` needed — not read through Drizzle.)
- `text("…").array().notNull().default(sql\`'{}'::text[]\`)` for `flavors`/`varieties`.
- `timestamp({ withTimezone: true }).notNull().defaultNow()` for `created_at`; nullable `email_verified`/`updated_at`.
- Composite PKs via `primaryKey({ columns: [...] })`; `text("id").primaryKey()` text PKs.
- All named secondary indexes preserved (e.g. `tastings_created_idx` with `.desc()`).

### 4. Baseline migration
`npx drizzle-kit generate --name init` → `drizzle/0000_init.sql` + `drizzle/meta/`. Review per the `/migration` skill; if the fidelity gate flags a divergence, fix `schema.ts` and regenerate (prefer over hand-patching the SQL).

### 5. `scripts/db-setup.ts` rewrite
- **`db:setup`** (default, **non-destructive**): programmatic `migrate(db, { migrationsFolder: "drizzle" })` (from `drizzle-orm/node-postgres/migrator`, using a setup-local `drizzle(pool)`), then **seed only if empty** (`select count(*) from roasters` === 0). Never drops. Run `migrate()` first (it owns its own transactions/journal — don't wrap it in the seed's transaction), then a separate transaction for the seed.
- **`db:reset --reset`** (gated on `process.argv.includes("--reset")`): `drop schema public cascade; create schema public;` → `migrate()` → seed unconditionally. Fixes the silently-ignored argv.
- Seed inserts stay raw `pg` (no behavior change).

### 6. CI — split into two jobs (`.github/workflows/ci.yml`)
- **`test`** job: `services: postgres:17-alpine` (`POSTGRES_DB: coffee_tracker_test`, `pg_isready` health-check); `DATABASE_URL` set at **job level**; steps: install → typecheck → `npm run db:setup` (migrate the test DB) → `npm test` → lint.
- **`build`** job: DB-less (unchanged from M3·A).
- Both pin Node 24.

### 7. `vitest.config.ts` — inline `projects`
- **`unit`**: existing config (node env, `include: ["test/**/*.test.ts"]`, `exclude: ["test/integration/**"]`, `server-only` alias). Parallel, DB-less — the ~94 existing tests run here, unchanged.
- **`integration`**: `include: ["test/integration/**/*.test.ts"]`, `fileParallelism: false`, `globalSetup` that (a) `dotenv.config({ path: ".env.test" })`, (b) **skips the project if `DATABASE_URL` is unset**, (c) tears down pools (`pool.end()`) so vitest doesn't hang. Per-test isolation: `TRUNCATE … RESTART IDENTITY CASCADE`.

### 8. Integration tests this PR ships
- `test/integration/schema-fidelity.test.ts` — Decision 1 (the gate).
- `test/integration/constraints.test.ts` — duplicate credential `lower(email)` → `err.constraint === "users_email_lower_uq"`; self-follow → `no_self_follow`; `rating = 6` → SQLSTATE `23514`; `public` app-table count === 11.

### 9. Freeze `db/schema.sql`
Header: `-- FROZEN pre-Drizzle snapshot. Source of truth is the Drizzle baseline (drizzle/) generated from lib/db/schema.ts. Kept as the fidelity oracle (test/integration/schema-fidelity.test.ts).` Stop running it from `db-setup.ts`. **Keep it** (the gate compares against it). It can be retired in a later cleanup once the baseline is trusted.

### 10. Local dev ergonomics
- `.env.test` (gitignored): `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffee_tracker_test`.
- One-time: `docker exec coffee-pg createdb -U postgres coffee_tracker_test`.
- `package.json`: `"test:integration"` running the integration project against `.env.test` (self-contained dotenv in globalSetup — no new CLI dep), with a `pretest:integration` that runs `db:setup`. **No** `pretest` hook on the main `npm test` (keeps the unit lane DB-free).
- SETUP/README note documenting the two commands.

---

## What is NOT in scope
- No `db = drizzle(pool)` in the app; no runtime query/action/auth rewrites — ever, under this approach.
- No conversion of the existing ~94 tests (the raw SQL they assert is unchanged).
- `db/schema.sql` is frozen, not deleted.
- Pagination is M3·D.

## Testing strategy
- **Unit lane** (DB-less, parallel): the existing ~94 tests stay green unchanged.
- **Integration lane** (real PG): the fidelity gate + constraint smoke tests. Gated behind `DATABASE_URL`; skipped locally if absent.
- **Live verification (controller-run):** `npm run db:setup` against a fresh DB applies the baseline + seeds; `db:reset --reset` drops + re-migrates + seeds; `db:setup` a second time is a no-op (idempotent, non-destructive); the app boots and renders against the migrated DB; a follow-up migration round-trip (`generate` a trivial additive change, `migrate`, confirm applied) — proving the workflow end-to-end.
- **Gate:** `tsc` + `npm test` (both projects when DB present) + `eslint` + `build`.

## Risks / open items
- **drizzle-kit default-literal cosmetics** (`'{}'` vs `ARRAY[]::text[]`): semantically equal; if the catalog `column_default` comparison trips on it, normalize the compared default or assert on `udt_name`+nullability for array columns.
- **Scratch-DB creation in CI/local** requires `CREATE DATABASE` privilege on the `postgres` maintenance db (the `postgres` superuser has it both in CI and on `coffee-pg`).
- **pool handle leak**: integration globalSetup/teardown must `pool.end()` or vitest hangs.

## File-change summary
**Create:** `drizzle.config.ts`, `lib/db/schema.ts`, `drizzle/0000_init.sql` (+ `drizzle/meta/`), `test/integration/schema-fidelity.test.ts`, `test/integration/constraints.test.ts`, the integration `globalSetup`, `.env.test` (gitignored; documented).
**Modify:** `scripts/db-setup.ts` (migrate + seed-if-empty + `--reset`), `.github/workflows/ci.yml` (split jobs + PG service), `vitest.config.ts` (projects), `package.json` (deps + scripts), `.gitignore` (`.env.test`), `db/schema.sql` (freeze header only), SETUP/README (test-DB note).
**Unchanged on purpose:** `lib/db.ts`, `lib/queries.ts`, `app/actions.ts`, `auth.ts`, `lib/users-repo.ts`, and all existing tests.
