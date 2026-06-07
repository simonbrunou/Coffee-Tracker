import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
// Imported so the `next-auth/jwt` module is resolved and its augmentation below
// is valid under `moduleResolution: bundler`.
import type {} from "next-auth/jwt";
import { pool, query, withTransaction } from "@/lib/db";
import { findCredentialUserByEmail, resolveOrCreateOAuthUser, getSessionVersion } from "@/lib/users-repo";
import { githubEmailVerified } from "@/lib/oauth-email";
import { verifyPassword, DUMMY_HASH } from "@/lib/passwords";
import { checkRateLimit, RL_IP_LIMIT, RL_EMAIL_LIMIT, warnIfUnknownIp } from "@/lib/rate-limit";
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 1800 }, // 30-min rolling
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
        // stops spraying one password across many emails.
        const ip = clientIp(request?.headers?.get("x-forwarded-for") ?? null, TRUSTED_PROXY_HOPS);
        warnIfUnknownIp(ip);
        // Cap the email in the key (RFC max 254) so a giant unvalidated value can't
        // bloat the rate_limits PK; the key is built before validateSignup runs.
        if (!(await checkRateLimit(`login:email:${email.toLowerCase().slice(0, 254)}`, RL_EMAIL_LIMIT))) return null;
        // Skip the per-IP check when the IP is unknown — never block on a shared
        // "unknown" bucket (an XFF misconfig would otherwise lock out everyone).
        if (ip !== "unknown" && !(await checkRateLimit(`login:ip:${ip}`, RL_IP_LIMIT))) return null;
        const user = await findCredentialUserByEmail(poolDb, email);
        // Always run a bcrypt compare (dummy hash on the no-user path) so timing
        // is identical → no user-enumeration oracle.
        const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
        if (!user || !ok) return null;
        return { id: user.id, sessionVersion: user.session_version } as unknown as { id: string };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile, user }) {
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
});
