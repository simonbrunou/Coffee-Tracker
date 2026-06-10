import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
// Imported so the `next-auth/jwt` module is resolved and its augmentation below
// is valid under `moduleResolution: bundler`.
import type {} from "next-auth/jwt";
import { pool, query, withTransaction } from "@/lib/db";
import { findCredentialUserByEmail, resolveOrCreateOAuthUser, getSessionVersion } from "@/lib/users-repo";
import { consumeLinkToken } from "@/lib/link-tokens";
import { linkAccount } from "@/lib/account-link-repo";
import { githubEmailVerified } from "@/lib/oauth-email";
import { verifyPassword, DUMMY_HASH } from "@/lib/passwords";
import { isRateLimited, recordAttempt, clearAttempts, RL_IP_LIMIT, RL_EMAIL_LIMIT, warnIfUnknownIp } from "@/lib/rate-limit";
import { clientIp, TRUSTED_PROXY_HOPS } from "@/lib/request-ip";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    sessionVersion: number;
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    sv: number;
  }
}

// `pool.query` is heavily overloaded; wrap it so it lines up with the repo's
// `Queryable` shape ({ query(text, params?): Promise<{ rows }> }) without
// weakening that type. This changes no runtime behavior — it still calls the
// shared pool.
const poolDb = { query: (text: string, params?: unknown[]) => pool.query(text, params) };
const queryDb = { query: (text: string, params?: unknown[]) => query(text, params) };

// Lazy factory: the config is rebuilt per request and receives the NextRequest
// on the /api/auth/* Route Handler (so the signIn callback can read link-nonce
// cookies via req.cookies); req is undefined from a server action's signIn()/
// unstable_update() — both correct.
export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth(async (req) => ({
  // 30-day rolling session: the JWT is re-issued at most once a day on activity
  // (updateAge), so active users effectively never get logged out; only sessions
  // idle for a full 30 days expire. Length is a UX choice — the real force-logout
  // control is session_version revocation (isLiveSession), which invalidates every
  // existing JWT immediately on "sign out everywhere" / password change.
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Google,
    GitHub,
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds, request) => {
        const email = String(creds?.email ?? "");
        const password = String(creds?.password ?? "");
        // Rate-limit the unauthenticated login endpoint by BOTH email and IP
        // (either tripping blocks): per-email stops targeted brute force, per-IP
        // stops spraying one password across many emails. Only FAILED attempts are
        // recorded and a success clears the email window, so an attacker can't wedge
        // a victim out by burning the victim's own legitimate logins (M1).
        const ip = clientIp(request?.headers?.get("x-forwarded-for") ?? null, TRUSTED_PROXY_HOPS);
        warnIfUnknownIp(ip);
        // Cap the email in the key (RFC max 254) so a giant unvalidated value can't
        // bloat the rate_limits PK; the key is built before validateSignup runs.
        const emailKey = `login:email:${email.toLowerCase().slice(0, 254)}`;
        const ipKey = `login:ip:${ip}`;
        const hasIp = ip !== "unknown"; // never block on a shared "unknown" bucket
        if (await isRateLimited(emailKey, RL_EMAIL_LIMIT)) return null;
        if (hasIp && (await isRateLimited(ipKey, RL_IP_LIMIT))) return null;
        const user = await findCredentialUserByEmail(poolDb, email);
        // Always run a bcrypt compare (dummy hash on the no-user path) so timing
        // is identical → no user-enumeration oracle.
        const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
        if (!user || !ok) {
          // Count the failure against both dimensions; legitimate users essentially
          // never hit this, so it can't self-lock.
          await recordAttempt(emailKey);
          if (hasIp) await recordAttempt(ipKey);
          return null;
        }
        // Success: clear ONLY the email window (not the IP one — see clearAttempts).
        await clearAttempts(emailKey);
        return { id: user.id, sessionVersion: user.session_version } as unknown as { id: string };
      },
    }),
  ],
  callbacks: {
    // Account-linking link branch: when linkOAuthStart set a per-provider link
    // nonce, the OAuth callback resolves the link HERE and returns a redirect
    // string (which short-circuits sign-in → preserves the actor's session, no
    // switch). Reading req.cookies is why auth.ts is a lazy factory. No nonce →
    // a normal sign-in (return true), unchanged behavior.
    async signIn({ account }) {
      if (!account || account.type === "credentials") return true;
      const raw = req?.cookies?.get(`link_nonce_${account.provider}`)?.value;
      if (!raw) return true; // normal OAuth login/signup → jwt resolves as today
      // R4: no cookie delete (unreliable inside the Auth.js callback); the atomic
      // single-use consumeLinkToken is the real guard + the cookie self-expires.
      const consumed = await consumeLinkToken(queryDb, raw, account.provider);
      if (!consumed) return "/settings?linkError=expired";
      const result = await linkAccount(account.provider, account.providerAccountId, consumed.userId, account.type);
      if (result === "taken") return "/settings?linkError=taken";
      // "linked" | "already": the redirect string preserves the actor's session.
      return "/settings?linked=1";
    },
    async jwt({ token, account, profile, user, trigger }) {
      // R1: honor unstable_update — re-stamp sv BEFORE the uid short-circuit, or a
      // bump-on-removal would log the ACTOR out (their re-signed cookie keeps the
      // old sv and fails the strict isLiveSession check). SECURITY: read the
      // AUTHORITATIVE session_version from the DB — NEVER the client-supplied
      // `session` payload (update()/useSession().update() data is attacker-
      // controllable; trusting it would let a revoked client re-stamp itself live
      // and bypass revocation).
      if (trigger === "update" && token.uid) {
        token.sv = (await getSessionVersion(queryDb, token.uid)) ?? token.sv;
        return token;
      }
      if (token.uid) return token; // already resolved — no DB hit on the hot path
      if (account) {
        if (account.type === "credentials") {
          token.uid = (user as { id: string }).id;
          token.sv = (user as unknown as { sessionVersion?: number }).sessionVersion ?? 0;
        } else {
          // Trust the provider's email-verified signal: Google sets email_verified;
          // GitHub's bundled provider returns the PRIMARY (not necessarily verified)
          // email, so confirm via /user/emails. Anything else → unverified.
          const emailVerified =
            account.provider === "google"
              ? profile?.email_verified === true
              : account.provider === "github" && account.access_token
                ? await githubEmailVerified(account.access_token)
                : false;
          const uid = await withTransaction((client) =>
            resolveOrCreateOAuthUser(client, {
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              type: account.type,
              name: (profile?.name as string) ?? null,
              email: (profile?.email as string) ?? null,
              image: (profile?.picture as string) ?? (profile?.avatar_url as string) ?? null,
              emailVerified,
            }),
          );
          token.uid = uid;
          token.sv = (await getSessionVersion(queryDb, uid)) ?? 0;
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid;
      session.sessionVersion = token.sv;
      return session;
    },
  },
}));
