"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FeedScreen } from "@/components/screens";
import { useShell } from "@/components/app-provider";

function FeedInner() {
  const s = useShell();
  const router = useRouter();
  const filter = useSearchParams().get("filter") ?? "Recent";
  const setFilter = (f: string) =>
    router.replace(f === "Recent" ? "/" : `/?filter=${encodeURIComponent(f)}`, { scroll: false });
  return (
    <FeedScreen likes={s.likes} onLike={s.toggleLike} onOpenBean={s.openBean} filter={filter} setFilter={setFilter} />
  );
}

export default function FeedPage() {
  return (
    <Suspense>
      <FeedInner />
    </Suspense>
  );
}
