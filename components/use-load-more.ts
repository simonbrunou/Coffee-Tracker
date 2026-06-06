"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Page } from "@/lib/pagination";

/**
 * Append-style pagination over a Server Action fetcher. Seeds from the server's
 * page 1 and re-seeds whenever that `initial` prop changes (e.g. after a write's
 * revalidatePath re-renders the page). `reset` swaps to a freshly-fetched page
 * (used on feed tab switch).
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

  useEffect(() => {
    gen.current++;
    setRows(initial.rows);
    setCursor(initial.nextCursor);
  }, [initial]);

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
