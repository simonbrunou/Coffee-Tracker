# Cortado — Coffee Journal

A warm, cozy coffee-tracking web app. Log the **bags** you buy (the rich catalog
record — roaster, origin, farm, varieties, SCA score, SCA tasting notes via the
full Coffee Taster's Flavor Wheel) and the **brews** you pull from them (the fast,
everyday action — pick a bag off your shelf, rate it, jot a note). Plus a social
feed, bean/roaster discovery, and a personal journal.

Implemented from a [Claude Design](https://claude.ai/design) handoff (`Coffee Tracker.html`),
recreated as a real **Next.js + TypeScript + Tailwind + Postgres** app.

## Stack

- **Next.js 15** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** — the warm OKLCH design system lives as CSS variables in
  `app/globals.css` and is exposed to Tailwind via `@theme inline`
- **shadcn/ui** (`components/ui/`) for the interactive primitives — Button, Badge,
  Input, Textarea, Dialog (the log sheet), Slider (SCA score), Accordion (flavor
  wheel), Avatar, Sonner toasts — restyled onto the warm palette
- **Dark mode** via `next-themes` (toggle in the sidebar / mobile bar). The whole
  app flips through a single `.dark` block that re-defines the base palette; every
  shadcn semantic token is a `var()` ref to it, so light↔dark needs no per-component work
- **Spectral** (display serif) + **Hanken Grotesk** (body) via `next/font`
- **Postgres** — server components read via `lib/queries.ts`; mutations (log brew,
  add bag, like) are Server Actions in `app/actions.ts`
- Custom coffee-bean SVG iconography — no emoji, no stock photos

## Prerequisites

- Node 20+ and a running **Postgres** reachable at `DATABASE_URL`
  (defaults to `postgresql://postgres:postgres@localhost:5432/coffee_tracker`).

The repo's `.mcp.json` points at the same database. To spin one up with Docker:

```bash
docker run -d --name coffee-pg \
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=coffee_tracker \
  -p 5432:5432 postgres:17-alpine
```

## Getting started

```bash
npm install
npm run db:setup     # create schema + seed (idempotent: drops & recreates tables)
npm run dev          # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

Set `DATABASE_URL` in the environment to point at a different database.

## Layout

```
app/
  layout.tsx        fonts + metadata; fetches initial data from Postgres (force-dynamic)
                    and mounts the AppProvider shell around the routes
  page.tsx          /            → Feed
  journal/page.tsx  /journal     → Journal (Brews + Shelf)
  discover/page.tsx /discover    → Discover
  profile/page.tsx  /profile     → Profile
  bean/[id]/page.tsx    /bean/:id    → Bean detail
  roaster/[id]/page.tsx /roaster/:id → Roaster detail
  actions.ts        server actions — logBrew / addBag / toggleLike
  globals.css       OKLCH design system + keyframes + component classes
  icon.svg
components/
  app-provider.tsx  layout-level client shell: nav chrome, lifted state
                    (beans/brews/likes), the log sheet, and useShell() for pages;
                    routing via next/navigation so state survives navigation
  data-context.tsx  window.DATA-shaped context, backed by lifted React state
  ui.tsx            Avatar, BeanRating, Icon, FlavorChip, Tag, Placeholder…
  cards.tsx         TastingCard, BeanCard, BeanBag
  screens.tsx       Feed, Journal (Brews + Shelf), Discover
  detail.tsx        BeanDetail (+ flavor radar), RoasterDetail, Profile
  log-sheet.tsx     LogSheet + quick BrewFlow
  bag-form.tsx      rich Add-a-bag form
  flavor-wheel.tsx  SCA Coffee Taster's Flavor Wheel picker
  sheet-chrome.tsx  shared bottom-sheet header + success panel
lib/
  types.ts          domain types
  seed-data.ts      seed catalog + static reference maps (flavor colors, methods)
  flavor-wheel.ts   SCA wheel taxonomy + leaf-color map
  db.ts             pg pool (server-only)
  queries.ts        read queries
db/schema.sql       tables (roasters, users, beans, tastings, likes)
scripts/db-setup.ts schema + seed runner
```

## Data model

Two core objects, exactly as the design landed:

- **Bean / Bag** — a rich catalog record, created once. When `owned`, it also lives
  on your shelf (with SCA score, bag weight, "% left").
- **Tasting / Brew** — the fast everyday action, logged against a bag.

The app shows a single user (`u1`, "You"); there is no auth — faithful to the
prototype, which is a personal journal.
