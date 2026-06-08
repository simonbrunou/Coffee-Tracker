import "server-only";
import { randomUUID } from "node:crypto";
import { generateHandle } from "@/lib/generate-handle";
import { randomAvatarTint } from "@/lib/avatar";

/** Minimal shape shared by the pool and a transaction client. */
export interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export interface OAuthProfile {
  provider: string;
  providerAccountId: string;
  type: string;            // 'oauth' | 'oidc'
  name: string | null;
  email: string | null;
  image: string | null;
  /** True when the provider verified the email (Google email_verified / GitHub
   *  primary+verified) — stamps users.email_verified so the write-gate passes. */
  emailVerified?: boolean;
}

/** Find the user behind an OAuth account, or create a fresh user + account.
 *  Keys ONLY on (provider, providerAccountId) — never email. Run inside a
 *  transaction in production so the two inserts are atomic. */
export async function resolveOrCreateOAuthUser(db: Queryable, p: OAuthProfile): Promise<string> {
  const found = await db.query(
    `select user_id from accounts where provider = $1 and provider_account_id = $2`,
    [p.provider, p.providerAccountId],
  );
  if (found.rows.length > 0) {
    const userId = (found.rows[0] as { user_id: string }).user_id;
    // Lazy-backfill email_verified for an existing OAuth user (e.g. predates M4·C).
    if (p.emailVerified) {
      await db.query(`update users set email_verified = now() where id = $1 and email_verified is null`, [userId]);
    }
    return userId;
  }

  const userId = `u-${randomUUID()}`;
  // generateHandle() has ~52 bits of entropy, but after migration 0005 the
  // lower(handle) unique index could (astronomically rarely) collide — retry ONCE
  // with a fresh handle so an OAuth sign-in never throws the raw pg error inside
  // the Auth.js jwt callback. userId is safely reused: the failed insert rolls
  // back atomically, so the PK is never persisted on the first attempt.
  const insertUser = () =>
    db.query(
      `insert into users (id, name, handle, avatar, email, image, session_version, email_verified)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [userId, p.name ?? "Coffee drinker", generateHandle(), randomAvatarTint(), p.email, p.image, 0, p.emailVerified ? new Date() : null],
    );
  try {
    await insertUser();
  } catch (e) {
    const pe = e as { code?: string; constraint?: string };
    if (pe?.code === "23505" && pe.constraint === "users_handle_lower_uq") await insertUser();
    else throw e;
  }
  await db.query(
    `insert into accounts (id, user_id, type, provider, provider_account_id)
     values ($1, $2, $3, $4, $5)`,
    [`acc-${randomUUID()}`, userId, p.type, p.provider, p.providerAccountId],
  );
  return userId;
}

export interface CredentialRow { id: string; password_hash: string; session_version: number }

export async function findCredentialUserByEmail(db: Queryable, email: string): Promise<CredentialRow | null> {
  const { rows } = await db.query(
    `select id, password_hash, session_version from users
     where lower(email) = lower($1) and password_hash is not null`,
    [email.toLowerCase()],
  );
  return (rows[0] as CredentialRow) ?? null;
}

/** Insert a credential user. Throws the raw pg error (caller inspects 23505 /
 *  err.constraint). `handle` null → generated. */
export async function createCredentialUser(
  db: Queryable,
  u: { name: string; email: string; passwordHash: string; handle: string | null; avatar: string },
): Promise<string> {
  const userId = `u-${randomUUID()}`;
  await db.query(
    `insert into users (id, name, handle, avatar, email, password_hash, session_version)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, u.name, u.handle ?? generateHandle(), u.avatar, u.email, u.passwordHash, 0],
  );
  return userId;
}

export async function getSessionVersion(db: Queryable, userId: string): Promise<number | null> {
  const { rows } = await db.query(`select session_version from users where id = $1`, [userId]);
  return rows.length ? (rows[0] as { session_version: number }).session_version : null;
}

export async function bumpSessionVersion(db: Queryable, userId: string): Promise<void> {
  await db.query(`update users set session_version = session_version + 1 where id = $1`, [userId]);
}

export interface SessionState { sessionVersion: number; emailVerified: Date | null; hasPassword: boolean }

/** One-shot fetch of the fields both the revocation check and the write-gate need. */
export async function getSessionState(db: Queryable, userId: string): Promise<SessionState | null> {
  const { rows } = await db.query(
    `select session_version, email_verified, (password_hash is not null) as has_password
     from users where id = $1`,
    [userId],
  );
  if (!rows.length) return null;
  const r = rows[0] as { session_version: number; email_verified: Date | null; has_password: boolean };
  return { sessionVersion: r.session_version, emailVerified: r.email_verified, hasPassword: r.has_password };
}
