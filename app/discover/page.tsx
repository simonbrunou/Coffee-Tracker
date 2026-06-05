"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DiscoverScreen } from "@/components/screens";
import { useShell } from "@/components/app-provider";

function DiscoverInner() {
  const s = useShell();
  const router = useRouter();
  const urlQuery = useSearchParams().get("q") ?? "";
  // local mirror keeps typing responsive; the URL is the shareable/reloadable source
  const [query, setQueryLocal] = useState(urlQuery);
  useEffect(() => setQueryLocal(urlQuery), [urlQuery]);
  const setQuery = (v: string) => {
    setQueryLocal(v);
    router.replace(v ? `/discover?q=${encodeURIComponent(v)}` : "/discover", { scroll: false });
  };
  return <DiscoverScreen onOpenBean={s.openBean} onOpenRoaster={s.openRoaster} query={query} setQuery={setQuery} />;
}

export default function DiscoverPage() {
  return (
    <Suspense>
      <DiscoverInner />
    </Suspense>
  );
}
