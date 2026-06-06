"use client";
import { useEffect, useState, useTransition } from "react";
import type { Page } from "@/lib/pagination";

/**
 * Append-style pagination over a Server Action fetcher. Seeds from the server's
 * page 1 and re-seeds whenever that `initial` prop changes (e.g. after a write's
 * revalidatePath re-renders the page). `reset` swaps to a freshly-fetched page
 * (used on feed tab switch).
 */
export function useLoadMore<T>(initial: Page<T>, fetcher: (cursor: string | null) => Promise<Page<T>>) {
  const [rows, setRows] = useState<T[]>(initial.rows);
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor);
  const [pending, start] = useTransition();

  useEffect(() => {
    setRows(initial.rows);
    setCursor(initial.nextCursor);
  }, [initial]);

  const loadMore = () =>
    start(async () => {
      if (!cursor) return;
      const next = await fetcher(cursor);
      setRows((prev) => [...prev, ...next.rows]);
      setCursor(next.nextCursor);
    });

  const reset = (p: Page<T>) => {
    setRows(p.rows);
    setCursor(p.nextCursor);
  };

  return { rows, loadMore, hasMore: cursor !== null, pending, reset };
}
