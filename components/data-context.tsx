"use client";
/* ============ Data context ============
   Shell + bounded per-user data, lifted to the app shell so it survives client
   navigation. Unbounded lists (feed, discover, a bean's reviews, a roaster's
   beans) are server-fetched per screen (M3·D·2) — not held here. */
import { createContext, useContext, useMemo } from "react";
import { BREW_METHODS, FLAVOR_COLORS, PROCESSES, ROAST_LEVELS } from "@/lib/seed-data";
import type { Bean, Page, Roaster, Tasting, User } from "@/lib/types";

export interface DataApi {
  ROASTERS: Roaster[];
  /** First keyset page of the Recent feed (M3·D). */
  feed: Page<Tasting>;
  /** Bounded per-user data + shell `me` (M3·D·2). */
  me: User | null;
  myTastings: Tasting[];
  myShelf: Bean[];
  savedTastings: Tasting[];
  wishlistBeans: Bean[];
  FLAVORS: Record<string, string>;
  BREW_METHODS: string[];
  ROAST_LEVELS: string[];
  PROCESSES: string[];
  currentUserId: string | null;
  roaster: (id: string | null | undefined) => Roaster | undefined;
  shelf: () => Bean[];
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({
  roasters,
  feed,
  me,
  myTastings,
  myShelf,
  savedTastings,
  wishlistBeans,
  currentUserId,
  children,
}: {
  roasters: Roaster[];
  feed: Page<Tasting>;
  me: User | null;
  myTastings: Tasting[];
  myShelf: Bean[];
  savedTastings: Tasting[];
  wishlistBeans: Bean[];
  currentUserId: string | null;
  children: React.ReactNode;
}) {
  // Index roasters by id once per `roasters` change so `roaster(id)` is an O(1)
  // map lookup instead of a linear `.find()` on every call (cards resolve their
  // roaster on each render). Same return values, including `undefined` for
  // unknown/empty ids.
  const roastersById = useMemo(() => new Map(roasters.map((r) => [r.id, r])), [roasters]);

  const value = useMemo<DataApi>(
    () => ({
      ROASTERS: roasters,
      feed,
      me,
      myTastings,
      myShelf,
      savedTastings,
      wishlistBeans,
      FLAVORS: FLAVOR_COLORS,
      BREW_METHODS,
      ROAST_LEVELS,
      PROCESSES,
      currentUserId,
      roaster: (id) => (id ? roastersById.get(id) : undefined),
      shelf: () => myShelf,
    }),
    [roasters, roastersById, feed, me, myTastings, myShelf, savedTastings, wishlistBeans, currentUserId],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a DataProvider");
  return ctx;
}
