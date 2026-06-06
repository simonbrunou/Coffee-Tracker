-- ============ Cortado — Postgres schema (HISTORICAL) ============
-- HISTORICAL pre-Drizzle snapshot, SUPERSEDED by drizzle/ (generated from
-- lib/db/schema.ts). No longer applied or asserted against — kept only for
-- reference. To change the schema, edit lib/db/schema.ts + add a Drizzle
-- migration (see the /migration skill). Do NOT use this file.
-- Two core objects, exactly as the design landed:
--   a Bean/Bag (rich catalog record, created once) and a Tasting/Brew
--   (the fast everyday action logged against a bag).
-- Lowercase, snake_case identifiers; Postgres text[] for the ordered
-- flavor-note and variety lists.

drop table if exists comments        cascade;
drop table if exists bean_wishlist   cascade;
drop table if exists tasting_saves   cascade;
drop table if exists roaster_follows cascade;
drop table if exists user_follows    cascade;
drop table if exists accounts cascade;
drop table if exists likes cascade;
drop table if exists tastings cascade;
drop table if exists beans cascade;
drop table if exists users cascade;
drop table if exists roasters cascade;

create table roasters (
  id        text primary key,
  name      text not null,
  city      text not null,
  founded   int  not null,
  beans     int  not null default 0,
  blurb     text not null default ''
);

create table users (
  id        text primary key,
  name      text not null,
  handle    text not null unique,
  avatar    text not null,                  -- avatar tint (hex)
  tastings  int  not null default 0, -- derived on read; not maintained by the app
  bio       text not null default '',
  email           text,                              -- display-only; NOT globally unique
  email_verified  timestamptz,
  image           text,                              -- OAuth avatar URL (distinct from avatar tint)
  password_hash   text,                              -- only credential users
  session_version int  not null default 0,           -- bump to revoke a user's JWTs
  created_at      timestamptz not null default now()
);

-- At most one *password* account per email; OAuth rows may share an email.
-- Named explicitly so registerUser can branch on err.constraint.
create unique index users_email_lower_uq on users (lower(email)) where password_hash is not null;

create table accounts (
  id                  text primary key,
  user_id             text not null references users(id) on delete cascade,
  type                text not null,              -- 'oauth' | 'oidc'
  provider            text not null,              -- 'google' | 'github'
  provider_account_id text not null,
  created_at          timestamptz not null default now(),
  unique (provider, provider_account_id)
);

create table beans (
  id           text primary key,
  name         text not null,
  roaster_id   text references roasters(id),  -- null for user-created bags
  roaster_name text,                          -- set when roaster_id is null
  origin       text   not null default '',
  process      text   not null default '',    -- free-form
  roast        text   not null default '',
  altitude     text   not null default '—',
  varietal     text   not null default '',
  price        numeric,                        -- null for user bags
  avg_rating   numeric not null default 0, -- derived on read; not maintained by the app
  ratings      int     not null default 0, -- derived on read; not maintained by the app
  color        text    not null,              -- bag/label tint (hex)
  flavors      text[]  not null default '{}', -- SCA tasting notes
  description  text    not null default '',
  -- bag (catalog) extras --
  farm         text,
  varieties    text[]  not null default '{}',
  sca_score    numeric,
  owned        boolean not null default false,
  bag_weight   text,
  purchased    text,
  remaining    numeric,                        -- fraction left 0–1; null if not on shelf
  user_id      text references users(id) on delete cascade,  -- owner; null only for a future shared catalog
  created_at   timestamptz not null default now(),
  constraint beans_owned_has_owner check (not owned or user_id is not null)
);

create table tastings (
  id         text primary key,
  user_id    text not null references users(id),
  bean_id    text not null references beans(id) on delete cascade,
  rating     int  not null check (rating between 1 and 5),
  brew       text not null default '',
  dose       text not null default '—',
  ratio      text not null default '—',
  temp       text not null default '—',
  note       text not null default '',
  likes      int  not null default 0, -- derived on read; not maintained by the app
  time       text not null default 'now',     -- relative age label
  created_at timestamptz not null default now()
);

create table likes (
  user_id    text not null references users(id),
  tasting_id text not null references tastings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tasting_id)
);

create table user_follows (
  follower_id text not null references users(id) on delete cascade,
  followee_id text not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint no_self_follow check (follower_id <> followee_id)
);

create table roaster_follows (
  user_id    text not null references users(id)    on delete cascade,
  roaster_id text not null references roasters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, roaster_id)
);

create table tasting_saves (
  user_id    text not null references users(id)    on delete cascade,
  tasting_id text not null references tastings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tasting_id)
);

create table bean_wishlist (
  user_id    text not null references users(id) on delete cascade,
  bean_id    text not null references beans(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, bean_id)
);

create table comments (
  id         text primary key,
  tasting_id text not null references tastings(id) on delete cascade,
  user_id    text not null references users(id)    on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index beans_user_owned_idx  on beans (user_id, owned);
create index beans_roaster_idx     on beans (roaster_id);
create index beans_created_idx     on beans (created_at desc);
create index tastings_created_idx  on tastings (created_at desc);
create index tastings_bean_idx     on tastings (bean_id);
create index accounts_user_idx     on accounts (user_id);
create index tastings_user_idx  on tastings (user_id);   -- getUsers tastings count
create index likes_tasting_idx  on likes (tasting_id);   -- per-tasting like count
create index user_follows_followee_idx   on user_follows   (followee_id);
create index roaster_follows_roaster_idx  on roaster_follows (roaster_id);
create index tasting_saves_tasting_idx    on tasting_saves   (tasting_id);
create index comments_tasting_idx         on comments        (tasting_id);
