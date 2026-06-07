"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DiscoverScreen } from "@/components/screens";
import { useShell } from "@/components/app-provider";
import type { Bean, Page } from "@/lib/types";

function DiscoverInner({ initialBeans, trending }: { initialBeans: Page<Bean>; trending: Bean[] }) {
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
  return (
    <DiscoverScreen
      initialBeans={initialBeans}
      trending={trending}
      onOpenBean={s.openBean}
      onOpenRoaster={s.openRoaster}
      query={query}
      setQuery={setQuery}
    />
  );
}

export function DiscoverClient(props: { initialBeans: Page<Bean>; trending: Bean[] }) {
  return (
    <Suspense>
      <DiscoverInner {...props} />
    </Suspense>
  );
}
