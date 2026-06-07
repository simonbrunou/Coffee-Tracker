import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { SettingsClient } from "./settings-client";

// Server component: settings is for signed-in users only. getCurrentUserId is
// revocation-aware, so a revoked/deleted session is redirected to /login.
export default async function SettingsPage() {
  const uid = await getCurrentUserId();
  if (!uid) redirect("/login");
  return <SettingsClient />;
}
