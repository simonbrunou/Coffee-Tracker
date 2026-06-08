import type { Metadata } from "next";
import { ProfileClient } from "./profile-client";

export const metadata: Metadata = { title: "Your Profile — Cortado", robots: { index: false, follow: false } };

export default function ProfilePage() {
  return <ProfileClient />;
}
