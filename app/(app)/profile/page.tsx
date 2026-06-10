import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { ProfileClient } from "./profile-client";

export const metadata: Metadata = { title: "Your Profile — Cortado", robots: { index: false, follow: false } };

// Server-side auth guard (the client login redirect was excised from ProfileView).
export default async function ProfilePage() {
  if (!(await getCurrentUserId())) redirect("/login");
  return <ProfileClient />;
}
