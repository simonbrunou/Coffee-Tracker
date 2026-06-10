"use client";
import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** A "go back" handler for deep-linkable detail pages: browser-back when there's
 *  history to return to, else a push to `fallback` so a cold-loaded /bean/:id or
 *  /roaster/:id still has a sensible Back target. */
export function useBackOr(fallback: string): () => void {
  const router = useRouter();
  return useCallback(
    () => (window.history.length > 1 ? router.back() : router.push(fallback)),
    [router, fallback],
  );
}
