/* ============ Cortado — DB migrate + seed ============
   Applies Drizzle migrations (additive, non-destructive) then seeds if empty.
     npm run db:setup   migrate + seed-if-empty (NEVER drops)
     npm run db:reset   --reset: drop public + drizzle schemas, migrate, seed

   Uses its own pg pool (not lib/db.ts, which is `server-only`). */
import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  BEANS,
  LIKED_SEED,
  ROASTERS,
  TASTINGS,
  USERS,
} from "../lib/seed-data";

config({ path: ".env.local" }); // load DATABASE_URL if a local env file exists

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/coffee_tracker";
const RESET = process.argv.includes("--reset");

const pool = new Pool({ connectionString, max: 4 });
const db = drizzle(pool);

async function isEmpty(): Promise<boolean> {
  const r = await pool.query<{ n: number }>("select count(*)::int as n from roasters");
  return Number(r.rows[0].n) === 0;
}

/** Seed the catalog + tastings. NOTE: the seed arrays are currently EMPTY (no
 *  committed demo content), so this is a no-op today; kept for when data is added. */
async function seed() {
  const client = await pool.connect();
  try {
    await client.query("begin");

    // Roasters
    for (const r of ROASTERS) {
      await client.query(
        `insert into roasters (id, name, city, founded, beans, blurb)
         values ($1,$2,$3,$4,$5,$6)`,
        [r.id, r.name, r.city, r.founded, r.beans, r.blurb],
      );
    }
    console.log(`✓ Seeded ${ROASTERS.length} roasters`);

    // Users
    for (const u of USERS) {
      await client.query(
        `insert into users (id, name, handle, avatar, tastings, bio)
         values ($1,$2,$3,$4,$5,$6)`,
        [u.id, u.name, u.handle, u.avatar, u.tastings, u.bio],
      );
    }
    console.log(`✓ Seeded ${USERS.length} users`);

    // Beans — created_at spaced so the seed order (b1 first) is preserved,
    // and any later user-added bag (now()) sorts ahead of them.
    const base = Date.now();
    for (let i = 0; i < BEANS.length; i++) {
      const b = BEANS[i];
      const createdAt = new Date(base - i * 60_000);
      await client.query(
        `insert into beans
           (id, name, roaster_id, roaster_name, origin, process, roast, altitude,
            varietal, price, avg_rating, ratings, color, flavors, description,
            farm, varieties, sca_score, owned, bag_weight, purchased, remaining, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [
          b.id, b.name, b.roasterId, b.roasterName ?? null, b.origin, b.process,
          b.roast, b.altitude, b.varietal, b.price, b.avgRating, b.ratings, b.color,
          b.flavors, b.desc, b.farm ?? null, b.varieties ?? [], b.scaScore ?? null,
          b.owned ?? false, b.bagWeight ?? null, b.purchased ?? null,
          b.remaining ?? null, createdAt,
        ],
      );
    }
    console.log(`✓ Seeded ${BEANS.length} beans`);

    // Tastings — t1 newest, spaced an hour apart, so the feed order matches.
    for (let i = 0; i < TASTINGS.length; i++) {
      const t = TASTINGS[i];
      const createdAt = new Date(base - i * 3_600_000);
      await client.query(
        `insert into tastings
           (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes, time, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          t.id, t.userId, t.beanId, t.rating, t.brew, t.dose, t.ratio, t.temp,
          t.note, t.likes, t.time, createdAt,
        ],
      );
    }
    console.log(`✓ Seeded ${TASTINGS.length} tastings`);

    // Likes
    for (const l of LIKED_SEED) {
      await client.query(
        `insert into likes (user_id, tasting_id) values ($1,$2) on conflict do nothing`,
        [l.userId, l.tastingId],
      );
    }
    console.log(`✓ Seeded ${LIKED_SEED.length} likes`);

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

  // Safety: never let --reset wipe a production database by accident.
  if (RESET && process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_RESET !== "1") {
    throw new Error(
      "Refusing destructive --reset with NODE_ENV=production. Set ALLOW_DESTRUCTIVE_RESET=1 to override.",
    );
  }

  if (RESET) {
    // Must drop the `drizzle` schema too: migrate() keeps its __drizzle_migrations
    // journal there, NOT in public. Dropping only public would leave the journal
    // marking 0000 as "applied", so migrate() below would skip re-creating the
    // tables -> empty schema -> seed crash.
    console.log("→ --reset: dropping schema public + drizzle (migration journal)");
    await pool.query(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
    );
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
