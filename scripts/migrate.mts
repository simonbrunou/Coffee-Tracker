/* ============ Cortado — production migration runner ============
   Applies pending Drizzle migrations and exits. NO seeding, NO drops — safe to
   run as a Railway pre-deploy command before every release.

   Local:           npm run db:migrate
   Railway (deploy): node .next/standalone/scripts/migrate.mts   (see railpack.json)

   Deliberately self-contained: imports ONLY runtime deps (`pg` + the zero-dep
   `drizzle-orm`), so it runs inside the trimmed standalone image where the app's
   server-only modules (lib/db, lib/logger, dotenv, tsx, drizzle-kit) are absent.
   Run directly with `node` — Node >= 23.6 strips the TS types natively. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Resolve the migrations folder whether we run from the repo root (dev) or from
// inside the standalone bundle (railpack copies `drizzle/` next to this script).
const candidates = [join(import.meta.dirname, "..", "drizzle"), join(process.cwd(), "drizzle")];
const migrationsFolder = candidates.find(existsSync);
if (!migrationsFolder) {
  console.error(`migrate: could not find a "drizzle" folder (looked in: ${candidates.join(", ")})`);
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("migrate: DATABASE_URL is not set");
  process.exit(1);
}

// Mirror of lib/db-ssl.ts resolveSslConfig — kept in sync intentionally; this
// script can't import the server-only helper, which isn't shipped in the bundle.
function ssl(): { rejectUnauthorized: boolean } | undefined {
  switch (process.env.DATABASE_SSL) {
    case "require":
      return { rejectUnauthorized: true };
    case "no-verify":
      return { rejectUnauthorized: false };
    default:
      return undefined;
  }
}

const pool = new Pool({ connectionString, max: 1, ssl: ssl() });
try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.log(`✓ migrations applied from ${migrationsFolder}`);
} catch (err) {
  console.error("migrate: failed —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
