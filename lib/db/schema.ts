import { sql } from "drizzle-orm";
import {
  pgTable, text, integer, numeric, boolean, timestamp,
  uniqueIndex, index, primaryKey, check, unique,
  type AnyPgColumn,
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
    discoverable: boolean("discoverable").notNull().default(false),
    email: text("email"),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    passwordHash: text("password_hash"),
    sessionVersion: integer("session_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Case-insensitive handle uniqueness (so @Sam and @sam can't coexist) — the
    // public /u/[handle] lookup is lower(handle)=lower($). A 23505 here still
    // falls through mapRegisterError to the generic username message.
    uniqueIndex("users_handle_lower_uq").on(lower(t.handle)),
    // App-load-bearing NAME (register-errors.ts branches on err.constraint).
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
    unique().on(t.provider, t.providerAccountId), // auto-name; gate compares by def
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
    // Composite keyset index for (created_at, id) cursor pagination (M3·D).
    index("beans_created_id_idx").on(t.createdAt.desc().nullsFirst(), t.id.desc()),
  ],
);

export const tastings = pgTable(
  "tastings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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
    // Composite keyset index for (created_at, id) cursor pagination (M3·D).
    index("tastings_created_id_idx").on(t.createdAt.desc().nullsFirst(), t.id.desc()),
    index("tastings_bean_idx").on(t.beanId),
    index("tastings_user_idx").on(t.userId),
  ],
);

export const likes = pgTable(
  "likes",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
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

export const tastingAssessments = pgTable(
  "tasting_assessments",
  {
    tastingId: text("tasting_id")
      .primaryKey()
      .references(() => tastings.id, { onDelete: "cascade" }),
    bodyIntensity: numeric("body_intensity"),
    acidityIntensity: numeric("acidity_intensity"),
    sweetnessIntensity: numeric("sweetness_intensity"),
    fruitIntensity: numeric("fruit_intensity"),
    floralIntensity: numeric("floral_intensity"),
    finishIntensity: numeric("finish_intensity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (t) => [
    check("ta_body_range",   sql`${t.bodyIntensity}      is null or ${t.bodyIntensity}      between 0 and 15`),
    check("ta_acid_range",   sql`${t.acidityIntensity}   is null or ${t.acidityIntensity}   between 0 and 15`),
    check("ta_sweet_range",  sql`${t.sweetnessIntensity} is null or ${t.sweetnessIntensity} between 0 and 15`),
    check("ta_fruit_range",  sql`${t.fruitIntensity}     is null or ${t.fruitIntensity}     between 0 and 15`),
    check("ta_floral_range", sql`${t.floralIntensity}    is null or ${t.floralIntensity}    between 0 and 15`),
    check("ta_finish_range", sql`${t.finishIntensity}    is null or ${t.finishIntensity}    between 0 and 15`),
  ],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_reset_at_idx").on(t.resetAt)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vt_token_hash_uq").on(t.tokenHash),
    index("vt_user_id_idx").on(t.userId),
    index("vt_expires_at_idx").on(t.expiresAt),
  ],
);

// Single-use, HMAC-hashed nonce binding an OAuth-link attempt to the initiating
// session (mirrors verification_tokens; `provider` replaces `email`).
export const linkTokens = pgTable(
  "link_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("lt_token_hash_uq").on(t.tokenHash),
    index("lt_user_id_idx").on(t.userId),
    index("lt_expires_at_idx").on(t.expiresAt),
  ],
);
