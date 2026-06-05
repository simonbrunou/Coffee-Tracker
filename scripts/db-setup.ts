/* ============ Cortado — DB setup / seed ============
   Creates the schema and seeds it with the catalog + tastings.
   Run with: npm run db:setup   (idempotent — drops & recreates tables).

   Uses its own pg pool (not lib/db.ts, which is `server-only`). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import { Pool } from "pg";
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

const pool = new Pool({ connectionString, max: 4 });

async function main() {
  const client = await pool.connect();
  try {
    console.log(`→ Connecting to ${connectionString.replace(/:[^:@/]+@/, ":***@")}`);

    // 1. Schema
    const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
    await client.query(schema);
    console.log("✓ Schema created");

    await client.query("begin");

    // 2. Roasters
    for (const r of ROASTERS) {
      await client.query(
        `insert into roasters (id, name, city, founded, beans, followers, blurb)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [r.id, r.name, r.city, r.founded, r.beans, r.followers, r.blurb],
      );
    }
    console.log(`✓ Seeded ${ROASTERS.length} roasters`);

    // 3. Users
    for (const u of USERS) {
      await client.query(
        `insert into users (id, name, handle, avatar, tastings, followers, following, bio)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [u.id, u.name, u.handle, u.avatar, u.tastings, u.followers, u.following, u.bio],
      );
    }
    console.log(`✓ Seeded ${USERS.length} users`);

    // 4. Beans — created_at spaced so the seed order (b1 first) is preserved,
    //    and any later user-added bag (now()) sorts ahead of them.
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

    // 5. Tastings — t1 newest, spaced an hour apart, so the feed order matches.
    for (let i = 0; i < TASTINGS.length; i++) {
      const t = TASTINGS[i];
      const createdAt = new Date(base - i * 3_600_000);
      await client.query(
        `insert into tastings
           (id, user_id, bean_id, rating, brew, dose, ratio, temp, note, likes, comments, time, mine, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          t.id, t.userId, t.beanId, t.rating, t.brew, t.dose, t.ratio, t.temp,
          t.note, t.likes, t.comments, t.time, t.mine, createdAt,
        ],
      );
    }
    console.log(`✓ Seeded ${TASTINGS.length} tastings`);

    // 6. Likes
    for (const l of LIKED_SEED) {
      await client.query(
        `insert into likes (user_id, tasting_id) values ($1,$2) on conflict do nothing`,
        [l.userId, l.tastingId],
      );
    }
    console.log(`✓ Seeded ${LIKED_SEED.length} likes`);

    await client.query("commit");
    console.log("\n✅ Database ready.");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("\n❌ DB setup failed:\n", err);
  process.exit(1);
});
