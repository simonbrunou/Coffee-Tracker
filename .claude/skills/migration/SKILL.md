---
name: migration
description: Create and apply a Drizzle schema migration for Coffee-Tracker (Postgres). Use when adding or changing a table or column. Invoked as /migration.
disable-model-invocation: true
---

# Drizzle migration workflow (Postgres)

This project uses **Drizzle + drizzle-kit** against **Postgres** (`dialect: 'postgresql'`). Schema lives in the Drizzle schema file (e.g. `src/db/schema.ts` or `src/lib/db/schema.ts`); generated SQL lands in `drizzle/`. The connection comes from `DATABASE_URL`.

Run these steps in order — do not skip the review step.

## 1. Edit the schema
Make the change in the Drizzle schema file. Match the existing style: `pgTable`, snake_case columns, explicit `references()` for FKs, `.notNull()` / `.default()` where appropriate, and the project's chosen id/type conventions (`uuid`/`serial`, `timestamp`, etc.).

## 2. Generate the migration
```bash
npx drizzle-kit generate
```
Writes a new numbered `.sql` file in `drizzle/` and updates `drizzle/meta`.

## 3. Review the generated SQL — REQUIRED
Read the new `drizzle/NNNN_*.sql`. Postgres is more forgiving than SQLite, but watch for:
- **A new `NOT NULL` column without a default** fails on a non-empty table. Add a `DEFAULT`, or split it: add nullable → backfill → `SET NOT NULL`.
- **Type changes** often need a `USING` clause (`ALTER COLUMN ... TYPE ... USING ...`); drizzle-kit may not infer the cast — fix the SQL by hand.
- **Renames** can be emitted as drop+add (data loss). If you meant a rename, edit to `ALTER TABLE ... RENAME COLUMN`.
- **Enums** — `ALTER TYPE ... ADD VALUE` can't run in the same transaction as other DDL on some PG versions; check statement ordering.
- Confirm FK `on delete` / `on update` actions match intent, and that new `UNIQUE`/index constraints won't fail on existing duplicate rows.

If the SQL is wrong, prefer fixing the schema and regenerating (delete the bad `drizzle/NNNN_*.sql` + its `drizzle/meta` entry first) over hand-patching.

## 4. Apply
```bash
npx drizzle-kit migrate
```

## 5. Verify
- `npx drizzle-kit studio` to eyeball the result.
- The read-only **`postgres` MCP** is ideal here: ask it to describe the table, check indexes, or `EXPLAIN` a query that uses the new column.
- Run the DB tests (see the `gen-test` skill) against a throwaway database to confirm migrations still apply cleanly.

## Commit
Commit the schema file, the new `drizzle/NNNN_*.sql`, and the `drizzle/meta/` changes together.
