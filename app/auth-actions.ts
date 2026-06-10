"use server";
import { headers } from "next/headers";
import { signIn, signOut } from "@/auth";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { randomAvatarTint } from "@/lib/avatar";
import { validateSignup, type SignupInput } from "@/lib/signup-validation";
import { createCredentialUser } from "@/lib/users-repo";
import { sendVerificationEmail } from "@/lib/verify-email";
import { recordAndCheck, RL_IP_LIMIT, RL_EMAIL_LIMIT, warnIfUnknownIp } from "@/lib/rate-limit";
import { clientIp, TRUSTED_PROXY_HOPS } from "@/lib/request-ip";
import { mapRegisterError } from "@/lib/register-errors";

const poolDb = { query: (text: string, params?: unknown[]) => pool.query(text, params) };

export async function registerUser(input: SignupInput): Promise<{ error: string }> {
  // Rate-limit the unauthenticated signup endpoint by BOTH email and IP (either blocks).
  const hdrs = await headers();
  const ip = clientIp(hdrs.get("x-forwarded-for"), TRUSTED_PROXY_HOPS);
  warnIfUnknownIp(ip);
  // Cap the email in the key (RFC max 254) so a giant value can't bloat the PK.
  // recordAndCheck is atomic (one upsert), so concurrent signups can't race past
  // the cap. No lockout concern here — there's no third party whose success the
  // counter could be weaponized against.
  if (!(await recordAndCheck(`signup:email:${input.email.toLowerCase().slice(0, 254)}`, RL_EMAIL_LIMIT))) return { error: "Too many attempts, try again later." };
  // Skip the per-IP check when the IP is unknown (see auth.ts rationale).
  if (ip !== "unknown" && !(await recordAndCheck(`signup:ip:${ip}`, RL_IP_LIMIT))) return { error: "Too many attempts, try again later." };

  const v = validateSignup(input);
  if (!v.ok) return { error: v.error };

  let userId: string;
  try {
    userId = await createCredentialUser(poolDb, {
      name: v.value.name,
      email: v.value.email,
      passwordHash: await hashPassword(v.value.password),
      handle: v.value.handle,
      avatar: randomAvatarTint(),
    });
  } catch (err) {
    return { error: mapRegisterError(err) };
  }

  // After a SUCCESSFUL insert only (the unique index throttles repeat-signup bombing).
  await sendVerificationEmail(userId);

  // OUTSIDE the try/catch: signIn throws the Next redirect (the success path),
  // which must NOT be swallowed by the 23505 handler above.
  await signIn("credentials", { email: v.value.email, password: v.value.password, redirectTo: "/" });
  return { error: "" }; // unreachable on success (redirect thrown)
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
