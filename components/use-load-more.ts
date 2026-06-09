"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Page } from "@/lib/pagination";

/**
 * Append-style pagination over a Server Action fetcher. Seeds from the server's
 * page 1 and re-seeds whenever that page's *content* changes (its `rows`/cursor,
 * e.g. after a write's revalidatePath re-renders the page) — not merely when the
 * parent hands down a new `Page` wrapper of identical content, which would
 * otherwise discard the accumulated load-more pages. `reset` swaps to a
 * freshly-fetched page (used on feed tab switch).
 *
 * A generation counter (bumped on every re-seed/reset) lets an in-flight
 * `loadMore` detect that the list was swapped underneath it (e.g. the user
 * switched tabs mid-fetch) and drop its now-stale result instead of appending
 * a previous tab's page onto the new list.
 */
export function useLoadMore<T>(initial: Page<T>, fetcher: (cursor: string | null) => Promise<Page<T>>) {
  const [rows, setRows] = useState<T[]>(initial.rows);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [pending, start] = useTransition();
  const gen = useRef(0);

  // Re-seed only when the server's page-1 *content* changes (new rows array or
  // cursor), not on every fresh `Page` wrapper identity. Keying on `[initial]`
  // discarded accumulated load-more pages whenever a parent re-created an
  // equivalent `Page` object on render; keying on its stable inner fields fixes
  // that while still re-seeding after a real revalidatePath (new `rows` array).
  useEffect(() => {
    gen.current++;
    setRows(initial.rows);
    setCursor(initial.nextCursor);
  }, [initial.rows, initial.nextCursor]);

  const loadMore = () =>
    start(async () => {
      if (!cursor) return;
      const g = gen.current;
      try {
        const next = await fetcher(cursor);
        if (g !== gen.current) return; // list was reset mid-flight → drop stale page
        setRows((prev) => [...prev, ...next.rows]);
        setCursor(next.nextCursor);
      } catch {
        // Transient failure (or a stale cursor): leave the list as-is.
      }
    });

  const reset = (p: Page<T>) => {
    gen.current++;
    setRows(p.rows);
    setCursor(p.nextCursor);
  };

  return { rows, loadMore, hasMore: cursor !== null, pending, reset };
}
