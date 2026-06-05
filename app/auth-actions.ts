"use server";
import { headers } from "next/headers";
import { signIn, signOut } from "@/auth";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { randomAvatarTint } from "@/lib/avatar";
import { validateSignup, type SignupInput } from "@/lib/signup-validation";
import { createCredentialUser } from "@/lib/users-repo";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapRegisterError } from "@/lib/register-errors";

const poolDb = { query: (text: string, params?: unknown[]) => pool.query(text, params) };

export async function registerUser(input: SignupInput): Promise<{ error: string }> {
  // Rate-limit the unauthenticated signup endpoint by BOTH email and IP (either blocks).
  const hdrs = await headers();
  const ip = (hdrs.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!checkRateLimit(`signup:email:${input.email.toLowerCase()}`)) return { error: "Too many attempts, try again later." };
  if (!checkRateLimit(`signup:ip:${ip}`)) return { error: "Too many attempts, try again later." };

  const v = validateSignup(input);
  if (!v.ok) return { error: v.error };

  try {
    await createCredentialUser(poolDb, {
      name: v.value.name,
      email: v.value.email,
      passwordHash: await hashPassword(v.value.password),
      handle: v.value.handle,
      avatar: randomAvatarTint(),
    });
  } catch (err) {
    return { error: mapRegisterError(err) };
  }

  // OUTSIDE the try/catch: signIn throws the Next redirect (the success path),
  // which must NOT be swallowed by the 23505 handler above.
  await signIn("credentials", { email: v.value.email, password: v.value.password, redirectTo: "/" });
  return { error: "" }; // unreachable on success (redirect thrown)
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
