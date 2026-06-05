"use client";
import { DiscoverScreen } from "@/components/screens";
import { useShell } from "@/components/app-provider";

export default function DiscoverPage() {
  const s = useShell();
  return (
    <DiscoverScreen onOpenBean={s.openBean} onOpenRoaster={s.openRoaster} query={s.query} setQuery={s.setQuery} />
  );
}
