"use client";
import { useState } from "react";
import Link from "next/link";
import { registerUser } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Credentials half of the sign-up card. The brand header, OAuth buttons, divider
 *  and "Have an account?" footer live in the server page (signup/page.tsx); this
 *  component is only the email/password form + its inline error and terms. */
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

  const field = { display: "flex", flexDirection: "column", gap: 5 } as const;

  return (
    <>
      {error && (
        <p role="alert" style={{ color: "var(--berry)", marginBottom: 14, fontSize: "var(--text-base)" }}>{error}</p>
      )}

      <form action={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={field}><Label htmlFor="name">Name</Label><Input id="name" name="name" autoComplete="name" required /></div>
        <div style={field}><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" autoComplete="email" required /></div>
        <div style={field}>
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-describedby="password-hint" />
          <p id="password-hint" style={{ fontSize: "var(--text-xs)", color: "var(--mocha)" }}>At least 8 characters.</p>
        </div>
        <div style={field}><Label htmlFor="handle">Handle (optional)</Label><Input id="handle" name="handle" autoComplete="username" placeholder="auto-generated if blank" /></div>
        <Button type="submit" disabled={pending} style={{ width: "100%", marginTop: 4 }}>{pending ? "Creating…" : "Sign up"}</Button>
      </form>

      <p style={{ marginTop: 14, fontSize: "var(--text-xs)", color: "var(--mocha)", lineHeight: 1.5 }}>
        By creating an account you agree to our{" "}
        <Link href="/terms" style={{ color: "var(--espresso)", fontWeight: 600 }}>Terms</Link> and{" "}
        <Link href="/privacy" style={{ color: "var(--espresso)", fontWeight: 600 }}>Privacy Policy</Link>.
      </p>
    </>
  );
}
