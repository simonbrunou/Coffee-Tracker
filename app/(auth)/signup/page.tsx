import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getCurrentUserId } from "@/lib/auth";
import { AuthCard, AuthDivider, OAuthButtons, AuthFooterLink } from "@/components/auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Create your account — Cortado", robots: { index: false, follow: false } };

export default async function SignupPage() {
  // Revocation-aware: a revoked/deleted session (stale cookie) must still reach
  // the form to re-authenticate, so check getCurrentUserId, not raw auth().
  if (await getCurrentUserId()) redirect("/");

  // OAuth sign-in doubles as sign-up (resolveOrCreateOAuthUser), so the same
  // provider buttons belong here for parity with /login.
  async function signupWithGithub() { "use server"; await signIn("github", { redirectTo: "/" }); }
  async function signupWithGoogle() { "use server"; await signIn("google", { redirectTo: "/" }); }

  return (
    <AuthCard
      title="Create your account"
      sub="Start logging your brews."
      footer={<AuthFooterLink prompt="Have an account?" href="/login" label="Sign in" />}
    >
      <OAuthButtons githubAction={signupWithGithub} googleAction={signupWithGoogle} />
      <AuthDivider />
      <SignupForm />
    </AuthCard>
  );
}
