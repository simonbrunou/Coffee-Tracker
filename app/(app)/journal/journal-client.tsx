"use client";
import { JournalScreen } from "@/components/screens";
import { useShell } from "@/components/app-provider";

export function JournalClient() {
  const s = useShell();
  return (
    <JournalScreen
      likes={s.likes}
      onLike={s.toggleLike}
      onOpenBean={s.openBean}
      onBrew={s.openBrew}
      onAddBag={s.openAddBag}
    />
  );
}
