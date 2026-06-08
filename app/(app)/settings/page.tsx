import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { getDiscoverable } from "@/lib/queries";
import { getAuthMethods } from "@/lib/account-link-repo";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings — Cortado", robots: { index: false, follow: false } };

// Server component: settings is for signed-in users only. getCurrentUserId is
// revocation-aware, so a revoked/deleted session is redirected to /login.
export default async function SettingsPage() {
  const uid = await getCurrentUserId();
  if (!uid) redirect("/login");
  const [discoverable, authMethods] = await Promise.all([getDiscoverable(uid), getAuthMethods(uid)]);
  return <SettingsClient discoverable={discoverable} authMethods={authMethods} />;
}
