import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUserId } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account — Cortado", robots: { index: false, follow: false } };

export default async function SignupPage() {
  // Revocation-aware: a revoked/deleted session (stale cookie) must still reach
  // the form to re-authenticate, so check getCurrentUserId, not raw auth().
  if (await getCurrentUserId()) redirect("/");
  return <SignupForm />;
}
