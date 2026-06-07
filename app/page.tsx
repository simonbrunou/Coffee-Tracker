"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FeedScreen } from "@/components/screens";
import { useShell } from "@/components/app-provider";

function FeedInner() {
  const s = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const filter = params.get("filter") ?? "Recent";
  const verified = params.get("verified");
  const setFilter = (f: string) =>
    router.replace(f === "Recent" ? "/" : `/?filter=${encodeURIComponent(f)}`, { scroll: false });
  // Surface the /api/verify outcome (it redirects to /?verified=1|0), then strip the param.
  useEffect(() => {
    if (verified === "1") toast.success("Email verified — you're all set.");
    else if (verified === "0") toast.error("That verification link is invalid or expired.");
    if (verified !== null) router.replace(filter === "Recent" ? "/" : `/?filter=${encodeURIComponent(filter)}`, { scroll: false });
  }, [verified, filter, router]);
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
