import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default async function LoginPage() {
  if (await auth()) redirect("/");

  async function loginWithCredentials(formData: FormData) {
    "use server";
    await signIn("credentials", {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/",
    });
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

      <form action={loginWithCredentials} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required /></div>
        <Button type="submit" style={{ width: "100%" }}>Sign in</Button>
      </form>

      <p style={{ marginTop: 18, fontSize: 14, color: "var(--mocha)" }}>
        No account? <a href="/signup" style={{ color: "var(--espresso)", fontWeight: 600 }}>Sign up</a>
      </p>
    </div>
  );
}
