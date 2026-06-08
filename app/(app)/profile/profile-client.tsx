"use client";
import { ProfileScreen } from "@/components/detail";
import { useShell } from "@/components/app-provider";

export function ProfileClient() {
  const s = useShell();
  return <ProfileScreen onOpenBean={s.openBean} likes={s.likes} onLike={s.toggleLike} />;
}
