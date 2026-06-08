import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getCurrentUserId } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <div style={{ maxWidth: 380, margin: "60px auto", padding: "0 20px" }}>
      <h1 className="display" style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Sign in</h1>
      <p style={{ color: "var(--mocha)", marginBottom: 22 }}>Welcome back to your coffee journal.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
        <form action={loginWithGithub}><Button type="submit" variant="outline" style={{ width: "100%" }}>Continue with GitHub</Button></form>
        <form action={loginWithGoogle}><Button type="submit" variant="outline" style={{ width: "100%" }}>Continue with Google</Button></form>
      </div>

      {error && (
        <p role="alert" style={{ color: "var(--destructive, #b24a44)", fontSize: 14, marginBottom: 12 }}>
          Invalid email or password.
        </p>
      )}
      <form action={loginWithCredentials} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" autoComplete="current-password" required /></div>
        <Button type="submit" style={{ width: "100%" }}>Sign in</Button>
      </form>

      <p style={{ marginTop: 18, fontSize: 14, color: "var(--mocha)" }}>
        No account? <a href="/signup" style={{ color: "var(--espresso)", fontWeight: 600 }}>Sign up</a>
      </p>
    </div>
  );
}
