# M3·C — Drizzle Migrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Adopt Drizzle + drizzle-kit for schema/migrations only (raw `pg` keeps running every query), prove the baseline is schema-equivalent to `db/schema.sql` via a hard CI gate, and make `db:setup` non-destructive with a working `--reset`.

**Architecture:** `lib/db/schema.ts` (hand-authored mirror) → `drizzle-kit generate` → `drizzle/0000_init.sql`. A real-Postgres **fidelity gate** applies the baseline and the frozen `db/schema.sql` to two scratch DBs and asserts catalog-equivalence. A new `integration` vitest project (Postgres-backed) holds the gate + constraint tests; the ~94 existing tests stay in the DB-less `unit` project. No app query is rewritten; `lib/db.ts` is untouched.

**Tech Stack:** Next.js 15, Postgres (node `pg`), drizzle-orm + drizzle-kit, vitest, Node 24.

**Spec:** `docs/superpowers/specs/2026-06-06-m3c-drizzle-migrations-design.md`

**Branch:** `feat/m3c-drizzle-migrations` (off `main` @ `97eee2c`).

**Key fidelity facts (the gate enforces these):**
- Named partial functional unique index `users_email_lower_uq` = `lower(email) WHERE password_hash IS NOT NULL` (app branches on `err.constraint`).
- **Three NON-cascade FKs**: `beans.roaster_id`, `tastings.user_id`, **`likes.user_id`** (the rest are `ON DELETE CASCADE`).
- CHECKs: `beans_owned_has_owner`, rating 1–5, `no_self_follow`, comment length 1–500.
- Inline `UNIQUE` constraints get Postgres names: `users_handle_key`, `accounts_provider_provider_account_id_key` — pin these names in Drizzle.
- 11 tables; `text` PKs; `text[]` with `'{}'::text[]` default; `numeric` vs `integer`; `timestamptz default now()`; composite PKs on the 5 join tables.

**Global gate (every task):** `npx tsc --noEmit` clean; `npm test` green (unit always; integration when a test DB is present).

---

### Task 1: Drizzle deps + config + integration test lane

**Files:**
- Modify: `package.json` (deps + scripts), `.gitignore`
- Create: `drizzle.config.ts`, `.env.test` (gitignored), `test/integration/_db.ts` (helpers), `test/integration/globalSetup.ts`, `test/integration/smoke.test.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Install Drizzle**

Run: `npm install drizzle-orm && npm install -D drizzle-kit`
Expected: both added; `npm audit` still 0 vulnerabilities.

- [ ] **Step 2: Create `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 3: Add `.env.test` (gitignored) + ignore rule**

Append to `.gitignore` under the secrets section:
```
.env.test
```
Create `.env.test`:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffee_tracker_test
```

- [ ] **Step 4: Create the test database (one-time, local)**

Run: `docker exec coffee-pg createdb -U postgres coffee_tracker_test 2>/dev/null || echo "exists"`
Expected: created (or "exists").

- [ ] **Step 5: Integration DB helpers — `test/integration/_db.ts`**

```ts
import { Pool, Client } from "pg";

/** Base test connection string (set via .env.test or CI job env). */
export function baseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set for integration tests");
  return url;
}

/** Swap the database name in a connection string (keeps host/creds/params). */
export function urlForDb(name: string): string {
  const u = new URL(baseUrl());
  u.pathname = `/${name}`;
  return u.toString();
}

/** A pool bound to the main test DB. Caller must end() it in afterAll. */
export function testPool(): Pool {
  return new Pool({ connectionString: baseUrl(), max: 4 });
}

/** Run admin SQL against the maintenance `postgres` db (for CREATE/DROP DATABASE). */
export async function admin(fn: (c: Client) => Promise<void>) {
  const c = new Client({ connectionString: urlForDb("postgres") });
  await c.connect();
  try {
    await fn(c);
  } finally {
    await c.end();
  }
}

/** Drop+create a scratch DB, run `sqlText` against it, return a connected Client. */
export async function freshDbWithSql(name: string, sqlText: string): Promise<Client> {
  await admin(async (c) => {
    await c.query(`drop database if exists ${name} with (force)`);
    await c.query(`create database ${name}`);
  });
  const client = new Client({ connectionString: urlForDb(name) });
  await client.connect();
  await client.query(sqlText);
  return client;
}

export async function dropDb(name: string) {
  await admin((c) => c.query(`drop database if exists ${name} with (force)`).then(() => {}));
}

/** Catalog snapshot used by the fidelity gate. */
export async function catalog(client: Client) {
  const columns = (
    await client.query(`
      select table_name, column_name, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, column_name`)
  ).rows;
  const constraints = (
    await client.query(`
      select conname, contype, pg_get_constraintdef(oid) as def
      from pg_constraint
      where connamespace = 'public'::regnamespace
      order by conname`)
  ).rows;
  const indexes = (
    await client.query(`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public'
      order by indexname`)
  ).rows;
  return { columns, constraints, indexes };
}
```

- [ ] **Step 6: `test/integration/globalSetup.ts`**

```ts
import { config } from "dotenv";

// Load the local test DB URL if present (no-op in CI, where DATABASE_URL is set
// at the job level). Integration test files self-skip when DATABASE_URL is unset.
export default function setup() {
  config({ path: ".env.test" });
}
```

- [ ] **Step 7: Split `vitest.config.ts` into `unit` + `integration` projects**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        plugins: [tsconfigPaths()],
        resolve: {
          alias: { "server-only": path.resolve(__dirname, "test/stubs/server-only.ts") },
        },
        test: {
          name: "unit",
          environment: "node",
          include: ["test/**/*.test.ts"],
          exclude: ["test/integration/**"],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "integration",
          environment: "node",
          include: ["test/integration/**/*.test.ts"],
          fileParallelism: false,
          globalSetup: ["test/integration/globalSetup.ts"],
        },
      },
    ],
  },
});
```

- [ ] **Step 8: Connectivity smoke test — `test/integration/smoke.test.ts`**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { testPool } from "./_db";

const hasDb = !!process.env.DATABASE_URL;
const pool = hasDb ? testPool() : null;
afterAll(async () => { await pool?.end(); });

describe.skipIf(!hasDb)("integration lane", () => {
  it("connects to the test database", async () => {
    const r = await pool!.query("select 1 as ok");
    expect(r.rows[0].ok).toBe(1);
  });
});
```

- [ ] **Step 9: package.json scripts**

Add:
```json
"test:integration": "vitest run --project integration",
"pretest:integration": "npm run db:setup"
```
(The integration project's globalSetup loads `.env.test`, so `npm run test:integration` finds the test DB. `db:setup` is rewritten in Task 4 to be non-destructive + read `DATABASE_URL`.)

- [ ] **Step 10: Verify the lanes**

Run: `npm test` (no `.env.test` loaded by unit project → integration self-skips except smoke which needs DB; smoke skips without DATABASE_URL).
Expected: unit project green (94 tests); integration smoke **skipped**.

Run: `npm run test:integration`
Expected: smoke test **passes** (connects to `coffee_tracker_test`).

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json .gitignore drizzle.config.ts vitest.config.ts test/integration/
git commit -m "build(m3c): drizzle deps + drizzle.config + integration vitest project + harness"
```

---

### Task 2: Schema mirror + baseline migration + the fidelity gate

**Files:**
- Create: `lib/db/schema.ts`, `drizzle/0000_init.sql` (generated), `drizzle/meta/*` (generated), `test/integration/schema-fidelity.test.ts`

**Approach:** Write the fidelity gate FIRST, then author `schema.ts`, generate, and iterate `schema.ts` until the gate is green. The gate is the oracle — it surfaces every drizzle-kit naming/default divergence.

- [ ] **Step 1: Write the fidelity gate — `test/integration/schema-fidelity.test.ts`**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshDbWithSql, dropDb, catalog } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("schema fidelity: Drizzle baseline == db/schema.sql", () => {
  const DRIZZLE_DB = "cortado_fidelity_drizzle";
  const SQL_DB = "cortado_fidelity_sql";

  afterAll(async () => {
    await dropDb(DRIZZLE_DB);
    await dropDb(SQL_DB);
  });

  it("produces catalog-equivalent schemas", async () => {
    const baseline = readFileSync(join(process.cwd(), "drizzle", "0000_init.sql"), "utf8");
    const handwritten = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");

    const a = await freshDbWithSql(DRIZZLE_DB, baseline);
    const b = await freshDbWithSql(SQL_DB, handwritten);
    try {
      const ca = await catalog(a);
      const cb = await catalog(b);
      // Compare as JSON sets so diffs are legible on failure.
      expect(ca.columns).toEqual(cb.columns);
      expect(ca.constraints).toEqual(cb.constraints);
      expect(ca.indexes).toEqual(cb.indexes);
    } finally {
      await a.end();
      await b.end();
    }
  });
});
```

- [ ] **Step 2: Author `lib/db/schema.ts` (the mirror)**

```ts
import { sql, type AnyPgColumn } from "drizzle-orm";
import {
  pgTable, text, integer, numeric, boolean, timestamp,
  uniqueIndex, index, primaryKey, check, unique,
} from "drizzle-orm/pg-core";

/** lower(col) for the partial functional unique index on users. */
export const lower = (c: AnyPgColumn) => sql`lower(${c})`;

export const roasters = pgTable("roasters", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  founded: integer("founded").notNull(),
  beans: integer("beans").notNull().default(0),
  blurb: text("blurb").notNull().default(""),
});

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    handle: text("handle").notNull(),
    avatar: text("avatar").notNull(),
    tastings: integer("tastings").notNull().default(0),
    bio: text("bio").notNull().default(""),
    email: text("email"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    passwordHash: text("password_hash"),
    sessionVersion: integer("session_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("users_handle_key").on(t.handle),
    uniqueIndex("users_email_lower_uq").on(lower(t.email)).where(sql`${t.passwordHash} is not null`),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("accounts_provider_provider_account_id_key").on(t.provider, t.providerAccountId),
    index("accounts_user_idx").on(t.userId),
  ],
);

export const beans = pgTable(
  "beans",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    roasterId: text("roaster_id").references(() => roasters.id), // NO cascade
    roasterName: text("roaster_name"),
    origin: text("origin").notNull().default(""),
    process: text("process").notNull().default(""),
    roast: text("roast").notNull().default(""),
    altitude: text("altitude").notNull().default("—"),
    varietal: text("varietal").notNull().default(""),
    price: numeric("price"),
    avgRating: numeric("avg_rating").notNull().default("0"),
    ratings: integer("ratings").notNull().default(0),
    color: text("color").notNull(),
    flavors: text("flavors").array().notNull().default(sql`'{}'::text[]`),
    description: text("description").notNull().default(""),
    farm: text("farm"),
    varieties: text("varieties").array().notNull().default(sql`'{}'::text[]`),
    scaScore: numeric("sca_score"),
    owned: boolean("owned").notNull().default(false),
    bagWeight: text("bag_weight"),
    purchased: text("purchased"),
    remaining: numeric("remaining"),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("beans_owned_has_owner", sql`not ${t.owned} or ${t.userId} is not null`),
    index("beans_user_owned_idx").on(t.userId, t.owned),
    index("beans_roaster_idx").on(t.roasterId),
    index("beans_created_idx").on(t.createdAt.desc()),
  ],
);

export const tastings = pgTable(
  "tastings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id), // NO cascade
    beanId: text("bean_id").notNull().references(() => beans.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    brew: text("brew").notNull().default(""),
    dose: text("dose").notNull().default("—"),
    ratio: text("ratio").notNull().default("—"),
    temp: text("temp").notNull().default("—"),
    note: text("note").notNull().default(""),
    likes: integer("likes").notNull().default(0),
    time: text("time").notNull().default("now"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("tastings_rating_check", sql`${t.rating} between 1 and 5`),
    index("tastings_created_idx").on(t.createdAt.desc()),
    index("tastings_bean_idx").on(t.beanId),
    index("tastings_user_idx").on(t.userId),
  ],
);

export const likes = pgTable(
  "likes",
  {
    userId: text("user_id").notNull().references(() => users.id), // NO cascade
    tastingId: text("tasting_id").notNull().references(() => tastings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tastingId] }),
    index("likes_tasting_idx").on(t.tastingId),
  ],
);

export const userFollows = pgTable(
  "user_follows",
  {
    followerId: text("follower_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    followeeId: text("followee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    check("no_self_follow", sql`${t.followerId} <> ${t.followeeId}`),
    index("user_follows_followee_idx").on(t.followeeId),
  ],
);

export const roasterFollows = pgTable(
  "roaster_follows",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roasterId: text("roaster_id").notNull().references(() => roasters.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.roasterId] }),
    index("roaster_follows_roaster_idx").on(t.roasterId),
  ],
);

export const tastingSaves = pgTable(
  "tasting_saves",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tastingId: text("tasting_id").notNull().references(() => tastings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.tastingId] }),
    index("tasting_saves_tasting_idx").on(t.tastingId),
  ],
);

export const beanWishlist = pgTable(
  "bean_wishlist",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    beanId: text("bean_id").notNull().references(() => beans.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.beanId] }),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: text("id").primaryKey(),
    tastingId: text("tasting_id").notNull().references(() => tastings.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    check("comments_body_check", sql`char_length(${t.body}) between 1 and 500`),
    index("comments_tasting_idx").on(t.tastingId),
  ],
);
```

- [ ] **Step 3: Generate the baseline migration**

Run: `npx drizzle-kit generate --name init`
Expected: `drizzle/0000_init.sql` + `drizzle/meta/` created. (`generate` is offline — it diffs `schema.ts` against the migration journal and needs no DB connection.)

- [ ] **Step 4: Run the fidelity gate**

Run: `npm run test:integration -- schema-fidelity`
Expected on first run: likely **FAIL** with a catalog diff. Read the diff and fix `lib/db/schema.ts`, then **delete `drizzle/` and regenerate** (Step 3) and re-run. Likely fixes:
- **Constraint/index names**: pin any auto-named UNIQUE to the Postgres name (`unique("…_key")`); confirm `users_email_lower_uq` name is preserved.
- **Array defaults**: if drizzle emits `ARRAY[]::text[]` vs `'{}'::text[]`, the `column_default` row differs — adjust the `.default(sql\`…\`)` literal to match `db/schema.sql`.
- **`numeric` defaults**: `avg_rating` default `0` may serialize as `'0'::numeric` on both sides — confirm equal.
- **CHECK defs**: both go through `pg_get_constraintdef` so `between` normalizes identically; a mismatch means a different expression — fix the `sql\`\`` text.
Iterate until: `expect(ca.columns/constraints/indexes).toEqual(...)` all pass.

- [ ] **Step 5: Confirm tsc + unit lane still green**

Run: `npx tsc --noEmit && npm test -- --project unit`
Expected: clean / 94 pass (schema.ts is types-only; nothing imports it at runtime yet).

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema.ts drizzle/ test/integration/schema-fidelity.test.ts
git commit -m "feat(m3c): drizzle schema mirror + baseline migration + catalog-fidelity gate"
```

---

### Task 3: Constraint smoke tests

**Files:**
- Create: `test/integration/constraints.test.ts`

These run against the migrated **test DB** (so they also prove the baseline applies via the real setup path once Task 4 lands; for now they apply the baseline directly through a fresh scratch DB to stay independent).

- [ ] **Step 1: Write the constraint tests**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { freshDbWithSql, dropDb } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("schema constraints fire", () => {
  const DB = "cortado_constraints";
  afterAll(() => dropDb(DB));

  async function client() {
    const baseline = readFileSync(join(process.cwd(), "drizzle", "0000_init.sql"), "utf8");
    return freshDbWithSql(DB, baseline);
  }

  it("has exactly 11 public tables (excluding the drizzle journal)", async () => {
    const c = await client();
    try {
      const r = await c.query(
        `select count(*)::int as n from information_schema.tables
         where table_schema='public' and table_name <> '__drizzle_migrations'`,
      );
      expect(r.rows[0].n).toBe(11);
    } finally { await c.end(); }
  });

  it("rejects a duplicate credential email (case-insensitive) via users_email_lower_uq", async () => {
    const c = await client();
    try {
      // Both rows have password_hash set and the same lower(email) -> trips the
      // partial functional unique index. (OAuth rows sharing an email would NOT,
      // since the index is WHERE password_hash IS NOT NULL.)
      await c.query(
        `insert into users (id,name,handle,avatar,email,password_hash)
         values ('u1','A','a','#000','X@x.com','h1')`,
      );
      await expect(
        c.query(
          `insert into users (id,name,handle,avatar,email,password_hash)
           values ('u2','B','b','#000','x@X.com','h2')`,
        ),
      ).rejects.toMatchObject({ constraint: "users_email_lower_uq" });
    } finally { await c.end(); }
  });

  it("rejects a self-follow via no_self_follow", async () => {
    const c = await client();
    try {
      await c.query(`insert into users (id,name,handle,avatar) values ('s','S','s','#000')`);
      await expect(
        c.query(`insert into user_follows (follower_id,followee_id) values ('s','s')`),
      ).rejects.toMatchObject({ constraint: "no_self_follow" });
    } finally { await c.end(); }
  });

  it("rejects rating 6 via the tastings rating check (SQLSTATE 23514)", async () => {
    const c = await client();
    try {
      await c.query(`insert into users (id,name,handle,avatar) values ('ru','R','r','#000')`);
      await c.query(`insert into beans (id,name,color) values ('rb','Bean','#000')`);
      await expect(
        c.query(`insert into tastings (id,user_id,bean_id,rating) values ('rt','ru','rb',6)`),
      ).rejects.toMatchObject({ code: "23514" });
    } finally { await c.end(); }
  });
});
```

- [ ] **Step 2: Run**

Run: `npm run test:integration -- constraints`
Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/integration/constraints.test.ts
git commit -m "test(m3c): integration constraint smoke tests (email uq, self-follow, rating, table count)"
```

---

### Task 4: Non-destructive `db:setup` + working `--reset`

**Files:**
- Modify: `scripts/db-setup.ts`

- [ ] **Step 1: Rewrite the bootstrap flow**

Replace the schema-application section (the `readFileSync(schema.sql)` + `client.query(schema)` block) with: a Drizzle migrate + a guarded reset + seed-if-empty. Concretely, restructure `main()`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { BEANS, LIKED_SEED, ROASTERS, TASTINGS, USERS } from "../lib/seed-data";

config({ path: ".env.local" });

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/coffee_tracker";
const RESET = process.argv.includes("--reset");

const pool = new Pool({ connectionString, max: 4 });
const db = drizzle(pool);

async function isEmpty(): Promise<boolean> {
  const r = await pool.query<{ n: string }>("select count(*)::int as n from roasters");
  return Number(r.rows[0].n) === 0;
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    // ... existing roaster/user/bean/tasting/like inserts, unchanged ...
    await client.query("commit");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function main() {
  console.log(`→ ${connectionString.replace(/:[^:@/]+@/, ":***@")}`);

  if (RESET) {
    console.log("→ --reset: dropping schema public");
    await pool.query("drop schema public cascade; create schema public;");
  }

  // Additive, idempotent: applies any pending migrations. Never drops on its own.
  await migrate(db, { migrationsFolder: "drizzle" });
  console.log("✓ Migrations applied");

  if (RESET || (await isEmpty())) {
    await seed();
    console.log("✅ Seeded.");
  } else {
    console.log("• Data present — skipped seed (non-destructive). Use --reset to wipe.");
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("\n❌ DB setup failed:\n", err);
    await pool.end();
    process.exit(1);
  });
```

Keep the existing INSERT loops verbatim inside `seed()`. The `migrate()` call must run on its own (it manages its own transactions) — do not wrap it in the seed transaction. Remove the old `readFileSync("db/schema.sql")` usage.

- [ ] **Step 2: Verify against the test DB (fresh + idempotent + reset)**

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffee_tracker_test
docker exec coffee-pg psql -U postgres -d coffee_tracker_test -c "drop schema public cascade; create schema public;"
npm run db:setup            # migrates + seeds (empty)
npm run db:setup            # migrates (no-op) + SKIPS seed (non-destructive)
npm run db:reset            # --reset: drops + migrates + seeds
```
Expected: first run "Seeded."; second run "skipped seed (non-destructive)."; reset run "Seeded." again. No `DROP TABLE` happens on a bare `db:setup`.

- [ ] **Step 3: Confirm `db:reset` passes `--reset`**

`package.json` already wires `"db:reset": "tsx scripts/db-setup.ts --reset"`. Confirm the script now reads it (Step 2's reset run seeds unconditionally).

- [ ] **Step 4: Commit**

```bash
git add scripts/db-setup.ts
git commit -m "feat(m3c): non-destructive db:setup (migrate + seed-if-empty) + working --reset"
```

---

### Task 5: CI split (Postgres test job + DB-less build job) + freeze schema.sql + docs

**Files:**
- Modify: `.github/workflows/ci.yml`, `db/schema.sql` (header), `SETUP.md`

- [ ] **Step 1: Rewrite `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: coffee_tracker_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/coffee_tracker_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"
      - run: npm ci
      - name: Type-check
        run: npm run typecheck
      - name: Migrate test DB
        run: npm run db:setup
      - name: Test
        run: npm test
      - name: Lint
        run: npm run lint

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          cache: "npm"
      - run: npm ci
      - name: Build
        run: npm run build
        env:
          AUTH_SECRET: "ci-build-placeholder-not-a-secret"
```

> `npm test` runs both vitest projects; the integration project sees the job-level `DATABASE_URL` and runs the gate + constraint tests.

- [ ] **Step 2: Freeze `db/schema.sql`** — replace the top comment block's first line region with a freeze header:

```sql
-- ============ Cortado — Postgres schema (FROZEN) ============
-- FROZEN pre-Drizzle snapshot. Source of truth is the Drizzle baseline in
-- drizzle/ generated from lib/db/schema.ts. Kept ONLY as the fidelity oracle
-- (test/integration/schema-fidelity.test.ts). Do not edit to change the schema —
-- add a Drizzle migration instead (see the /migration skill).
```
(Keep the rest of the file unchanged — the gate reads it.)

- [ ] **Step 3: Document the test DB in `SETUP.md`**

Add a short "Integration tests" section:
```markdown
## Integration tests (real Postgres)
One-time: `docker exec coffee-pg createdb -U postgres coffee_tracker_test`
Run: `npm run test:integration`  (migrates the test DB, then runs the fidelity + constraint tests)
`npm test` runs the DB-less unit suite plus integration tests when a test DB / DATABASE_URL is available.
```

- [ ] **Step 4: Local full preflight**

Run: `npm run typecheck && npm run lint && npm run test:integration && npm test`
Expected: all green (integration gate + constraints + 94 unit).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml db/schema.sql SETUP.md
git commit -m "ci(m3c): split test(+postgres)/build jobs; freeze db/schema.sql; document test DB"
```

---

### Task 6: Live verification spike (controller-run, not a subagent)

**Files:** none (procedure). Run after Tasks 1–5.

- [ ] **Step 1: Migration workflow end-to-end** — `generate` a throwaway additive migration, apply it, confirm, then discard:
```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/coffee_tracker_test
# add a temp nullable column to schema.ts (e.g. roasters.note text), then:
npx drizzle-kit generate --name tmp_note
npm run db:setup     # applies 0001; no reseed (data present)
docker exec coffee-pg psql -U postgres -d coffee_tracker_test -c "\d roasters" | grep note
# revert: remove the column from schema.ts, delete drizzle/0001_tmp_note.sql + its meta entry
```
Expected: the column appears after migrate; proves generate→migrate works. Revert the throwaway migration before finishing.

- [ ] **Step 2: App boots against the migrated DB** — point dev at the test DB (or re-seed the dev DB via the new `db:setup`) and load `/`:
```bash
docker exec coffee-pg psql -U postgres -d coffee_tracker -c "drop schema public cascade; create schema public;"
npm run db:setup     # against the dev DB (coffee_tracker)
PORT=3460 npm run dev  # load http://localhost:3460/ — beans/tastings render, counts correct
```
Expected: the app renders real seeded data — confirms the Drizzle-migrated schema is byte-identical to what the raw queries expect.

- [ ] **Step 3: Record results** in the PR description. No code commit.

---

## Self-review checklist (controller, before PR)
- [ ] Fidelity gate green (catalog columns/constraints/indexes equal); the three non-cascade FKs and `users_email_lower_uq` verified by it.
- [ ] `db:setup` non-destructive; second run skips seed; `db:reset` wipes + reseeds.
- [ ] `npm run typecheck && npm run lint && npm test && npm run build` green; CI `test` (with Postgres) + `build` jobs both green on the PR.
- [ ] `lib/db.ts`, `lib/queries.ts`, `app/actions.ts`, `auth.ts`, `users-repo.ts`, and all existing tests unchanged.
- [ ] Run `/code-review` on the PR and post a summary comment (standing convention).
