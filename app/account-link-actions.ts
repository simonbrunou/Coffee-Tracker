"use server";
import { cookies } from "next/headers";
import { signIn } from "@/auth";
import { pool } from "@/lib/db";
import { requireUserId } from "@/lib/auth";
import { createLinkToken } from "@/lib/link-tokens";

const poolDb = { query: (text: string, params?: unknown[]) => pool.query(text, params) };
const LINKABLE = new Set(["google", "github"]);

/** Begin linking `provider` to the caller's account: mint a single-use link
 *  nonce + set the per-provider cookie, then start the OAuth flow. The OAuth
 *  callback's signIn branch (auth.ts) consumes the nonce and links. */
export async function linkOAuthStart(provider: string): Promise<void> {
  const uid = await requireUserId();
  if (!LINKABLE.has(provider)) throw new Error("Unsupported provider");
  const raw = await createLinkToken(poolDb, uid, provider);
  // Set-cookie MUST be the statement immediately before signIn (no try/catch):
  // its Set-Cookie rides the one 302 to the provider; SameSite=Lax survives the
  // top-level OAuth redirect back to /api/auth/callback. secure only in prod (a
  // Secure cookie is dropped over http localhost → the link would silently merge).
  (await cookies()).set(`link_nonce_${provider}`, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  await signIn(provider, { redirectTo: "/settings" }); // redirect throws — last statement
}
