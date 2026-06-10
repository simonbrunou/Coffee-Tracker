import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getCurrentUserId } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard, AuthDivider, OAuthButtons, AuthFooterLink } from "@/components/auth-card";

export const metadata: Metadata = { title: "Sign in — Cortado", robots: { index: false, follow: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // Revocation-aware: a revoked/deleted session (stale cookie) must still reach
  // the form to re-authenticate, so check getCurrentUserId, not raw auth().
  if (await getCurrentUserId()) redirect("/");
  const { error } = await searchParams;

  async function loginWithCredentials(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: "/",
      });
    } catch (e) {
      // Only a credentials failure becomes the inline alert; config/other
      // AuthErrors and the success NEXT_REDIRECT re-throw so they surface
      // (a misconfig should be a real 500, not "invalid password").
      if (e instanceof AuthError && e.type === "CredentialsSignin") redirect("/login?error=1");
      throw e;
    }
  }
  async function loginWithGithub() { "use server"; await signIn("github", { redirectTo: "/" }); }
  async function loginWithGoogle() { "use server"; await signIn("google", { redirectTo: "/" }); }

  return (
    <AuthCard
      title="Sign in"
      sub="Welcome back to your coffee journal."
      footer={<AuthFooterLink prompt="No account?" href="/signup" label="Sign up" />}
    >
      <OAuthButtons githubAction={loginWithGithub} googleAction={loginWithGoogle} />
      <AuthDivider />
      {error && (
        <p role="alert" style={{ color: "var(--berry)", fontSize: "var(--text-base)", marginBottom: 12 }}>
          Invalid email or password.
        </p>
      )}
      <form action={loginWithCredentials} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <Button type="submit" style={{ width: "100%", marginTop: 4 }}>Sign in</Button>
      </form>
    </AuthCard>
  );
}
