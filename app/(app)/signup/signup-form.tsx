"use client";
import { useState } from "react";
import { registerUser } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError("");
    // On success registerUser throws the redirect; on failure it returns { error }.
    const res = await registerUser({
      name: String(formData.get("name") ?? ""),
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      handle: String(formData.get("handle") ?? ""),
    });
    setPending(false);
    if (res?.error) setError(res.error);
  }

  return (
    <div style={{ maxWidth: 380, margin: "60px auto", padding: "0 20px" }}>
      <h1 className="display" style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Create your account</h1>
      <p style={{ color: "var(--mocha)", marginBottom: 22 }}>Start logging your brews.</p>

      {error && (
        <p role="alert" style={{ color: "var(--destructive, #b24a44)", marginBottom: 14, fontSize: 14 }}>{error}</p>
      )}

      <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div>
        <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required /></div>
        <div><Label htmlFor="password">Password</Label><Input id="password" name="password" type="password" required minLength={8} /></div>
        <div><Label htmlFor="handle">Handle (optional)</Label><Input id="handle" name="handle" placeholder="auto-generated if blank" /></div>
        <Button type="submit" disabled={pending} style={{ width: "100%" }}>{pending ? "Creating…" : "Sign up"}</Button>
      </form>

      <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--mocha)", lineHeight: 1.5 }}>
        By creating an account you agree to our{" "}
        <a href="/terms" style={{ color: "var(--espresso)", fontWeight: 600 }}>Terms</a> and{" "}
        <a href="/privacy" style={{ color: "var(--espresso)", fontWeight: 600 }}>Privacy Policy</a>.
      </p>

      <p style={{ marginTop: 18, fontSize: 14, color: "var(--mocha)" }}>
        Have an account? <a href="/login" style={{ color: "var(--espresso)", fontWeight: 600 }}>Sign in</a>
      </p>
    </div>
  );
}
