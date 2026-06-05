"use client";
/* ============ Data context ============
   Mirrors the prototype's `window.DATA` shape so component bodies read
   naturally (`const D = useData()`), but is backed by React state lifted to
   the app shell — so logging a brew or adding a bag updates every screen. */
import { createContext, useContext, useMemo } from "react";
import { BREW_METHODS, FLAVOR_COLORS, PROCESSES, ROAST_LEVELS } from "@/lib/seed-data";
import type { Bean, Roaster, Tasting, User } from "@/lib/types";

export interface DataApi {
  ROASTERS: Roaster[];
  USERS: User[];
  BEANS: Bean[];
  TASTINGS: Tasting[];
  FLAVORS: Record<string, string>;
  BREW_METHODS: string[];
  ROAST_LEVELS: string[];
  PROCESSES: string[];
  currentUserId: string | null;
  bean: (id: string) => Bean | undefined;
  roaster: (id: string | null | undefined) => Roaster | undefined;
  user: (id: string) => User | undefined;
  shelf: () => Bean[];
}

const DataContext = createContext<DataApi | null>(null);

export function DataProvider({
  roasters,
  users,
  beans,
  tastings,
  currentUserId,
  children,
}: {
  roasters: Roaster[];
  users: User[];
  beans: Bean[];
  tastings: Tasting[];
  currentUserId: string | null;
  children: React.ReactNode;
}) {
  const value = useMemo<DataApi>(
    () => ({
      ROASTERS: roasters,
      USERS: users,
      BEANS: beans,
      TASTINGS: tastings,
      FLAVORS: FLAVOR_COLORS,
      BREW_METHODS,
      ROAST_LEVELS,
      PROCESSES,
      currentUserId,
      bean: (id) => beans.find((b) => b.id === id),
      roaster: (id) => (id ? roasters.find((r) => r.id === id) : undefined),
      user: (id) => users.find((u) => u.id === id),
      shelf: () => beans.filter((b) => b.owned && b.ownerId === currentUserId),
    }),
    [roasters, users, beans, tastings, currentUserId],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataApi {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a DataProvider");
  return ctx;
}
