"use client";
import { ProfileScreen } from "@/components/detail";
import { useShell } from "@/components/app-provider";

export default function ProfilePage() {
  const s = useShell();
  return <ProfileScreen onOpenBean={s.openBean} likes={s.likes} onLike={s.toggleLike} />;
}
