---
name: migration
description: Use when changing Cortado's Postgres schema (lib/db/schema.ts) — creating, altering, or dropping tables/columns/indexes/constraints, or adding a migration. Encodes the exact Drizzle generate→review→apply flow and this repo's migration footguns.
---

# Cortado schema migration flow

Source of truth is `lib/db/schema.ts` (Drizzle, dialect `postgresql`). Migrations live in
`drizzle/NNNN_*.sql`, recorded in `drizzle/meta/_journal.json`. NEVER hand-edit a committed
`drizzle/*.sql` or `drizzle/meta/*` — they are immutable and replayed in prod by
`scripts/migrate.mts` (a PreToolUse hook blocks such edits). Always generate a NEW migration.

## Steps
1. **Edit `lib/db/schema.ts` only.** Match conventions:
   - `id: text("id").primaryKey()` (string ids), `timestamp(..., { withTimezone: true })`,
     `.notNull().defaultNow()` for createdAt.
   - FKs to a user MUST be `.references(() => users.id, { onDelete: "cascade" })` so account
     deletion purges them — unless the data must survive deletion (document why).
   - Add the supporting `index(...)` (this codebase indexes every FK and the keyset-pagination
     pair `(created_at desc, id desc)`).
2. **Generate:** `npx drizzle-kit generate` — writes the next `drizzle/NNNN_*.sql` + meta snapshot, bumps `_journal.json`.
3. **Review the generated SQL by hand.** Confirm it's additive/safe with no unintended `DROP`
   (drizzle-kit can emit destructive ops on a rename — verify).
4. **Apply locally** (additive, non-destructive; seeds if empty — never drops): `npm run db:setup`.
   Use `npm run db:reset` ONLY to wipe + re-migrate + re-seed a throwaway local DB.
5. **Commit the generated `drizzle/` files WITH the schema change.** CI runs
   `drizzle-kit generate --name ci_drift_check` and FAILS if `git status --porcelain drizzle/` is
   dirty — forgetting to commit the migration breaks the build.

## PII / GDPR checklist for a new user-owned table
- Cascade-deletes with the user (FK `onDelete:"cascade"`)? If it can't have an FK (e.g. keyed by
  email like `rate_limits`), add a manual purge in `deleteUserWithPii` (lib/users-repo.ts) inside
  the existing `withTransaction`.
- Should it appear in the self-service export? If yes, add it to `lib/data-export.ts` — but NEVER
  export secrets (password_hash, session_version, token hashes, OAuth tokens).

## Prod note
Production applies migrations via `node .next/standalone/scripts/migrate.mts` (Railway pre-deploy).
That script imports only `pg` + `drizzle-orm` and CANNOT import `lib/*` (server-only) — don't add app imports to it.
