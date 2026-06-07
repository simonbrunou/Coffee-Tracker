# M4·C — Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify credential users' email (Resend, with a dev fallback) and write-gate unverified credential users; OAuth users auto-verified by the provider.

**Architecture:** No Auth.js adapter (hand-rolled, per the architecture dig). A `verification_tokens` table holds HMAC-hashed, single-use, 24h tokens; a `/api/verify` GET handler consumes them and stamps `users.email_verified`. The write-gate is a **live DB read** (`getSessionState` + `requireVerifiedUserId`), never a JWT flag (the JWT is frozen at login). Three cuts: email infra → verification flow → write-gate.

**Tech Stack:** Next.js 15 App Router (Route Handler, Server Actions), Postgres (raw `pg`), Drizzle migrations, Auth.js v5 (JWT), Resend, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-m4c-email-verification-design.md`
**Branch:** `feat/m4c-email-verification` (created; spec committed at `a673ec1`).

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `package.json` | deps | add `resend` |
| `lib/email.ts` | Resend send + dev fallback | Create |
| `lib/db/schema.ts` + `drizzle/0004` | `verification_tokens` table | Modify + generate |
| `lib/verification-tokens.ts` | token gen/hash/create/consume | Create |
| `lib/env.ts` | warn on missing Resend config | Modify |
| `lib/verify-email.ts` | `sendVerificationEmail(userId)` orchestrator | Create |
| `app/api/verify/route.ts` | GET verify endpoint | Create |
| `app/verify-actions.ts` | `resendVerification` Server Action | Create |
| `lib/oauth-email.ts` | `githubEmailVerified(token)` | Create |
| `lib/users-repo.ts` | `resolveOrCreateOAuthUser` auto-verify + `getSessionState` | Modify |
| `auth.ts` | jwt OAuth branch passes verified signal | Modify |
| `app/auth-actions.ts` | `registerUser` sends after insert | Modify |
| `lib/auth-guard.ts` | `isWriteAllowed` predicate | Modify |
| `lib/auth.ts` | `requireVerifiedUserId` | Modify |
| `app/actions.ts` | content writes use `requireVerifiedUserId` | Modify |
| `lib/queries.ts` + `lib/types.ts` | `needsEmailVerification` in AppData | Modify |
| `components/app-provider.tsx` + `components/data-context.tsx` | verify banner | Modify |

---

## CUT 1 — Email infrastructure

### Task 1: Resend send abstraction (`lib/email.ts`)

**Files:** Create `lib/email.ts`, `test/email.test.ts`; Modify `package.json`

- [ ] **Step 1: Install Resend**

```bash
npm install resend
```
Expected: `resend` added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the failing test**

Create `test/email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: sendMock } })) }));
const infoMock = vi.fn();
const errorMock = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { info: (...a: unknown[]) => infoMock(...a), error: (...a: unknown[]) => errorMock(...a), warn: vi.fn(), debug: vi.fn() },
}));

beforeEach(() => { sendMock.mockReset(); infoMock.mockReset(); errorMock.mockReset(); delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; });

async function load() { return (await import("@/lib/email")).sendEmail; }

describe("sendEmail", () => {
  it("dev fallback: logs (no SDK call) when RESEND_API_KEY is absent", async () => {
    const sendEmail = await load();
    await sendEmail("u@e.com", "Subj", "<p>hi</p>");
    expect(sendMock).not.toHaveBeenCalled();
    expect(infoMock).toHaveBeenCalledWith("email_dev_fallback", expect.objectContaining({ to: "u@e.com" }));
  });
  it("sends via Resend when configured", async () => {
    process.env.RESEND_API_KEY = "re_x"; process.env.EMAIL_FROM = "no-reply@cortado.test";
    sendMock.mockResolvedValueOnce({ data: { id: "e1" }, error: null });
    const sendEmail = await load();
    await sendEmail("u@e.com", "Subj", "<p>hi</p>");
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ from: "no-reply@cortado.test", to: "u@e.com", subject: "Subj" }));
  });
  it("throws when Resend returns an error", async () => {
    process.env.RESEND_API_KEY = "re_x"; process.env.EMAIL_FROM = "no-reply@cortado.test";
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "bad" } });
    const sendEmail = await load();
    await expect(sendEmail("u@e.com", "Subj", "<p>hi</p>")).rejects.toThrow(/bad/);
  });
});
```

- [ ] **Step 3: Run it — verify it fails**

Run: `npx vitest run --project unit test/email.test.ts`
Expected: FAIL — cannot resolve `@/lib/email`.

- [ ] **Step 4: Implement**

Create `lib/email.ts`:

```ts
import "server-only";
import { Resend } from "resend";
import { logger } from "@/lib/logger";

/** Send an email via Resend. Dev fallback: when RESEND_API_KEY is unset, log the
 *  send instead of calling the SDK, so the verification flow works locally without
 *  Resend credentials. Resend's send returns { data, error } (it does NOT throw) —
 *  we surface a failure as a thrown Error so callers can react. */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    logger.info("email_dev_fallback", { to, subject });
    return;
  }
  const { error } = await new Resend(apiKey).emails.send({ from, to, subject, html });
  if (error) {
    logger.error("email_send_error", { to, subject, err: error.message });
    throw new Error(`email send failed: ${error.message}`);
  }
}
```

- [ ] **Step 5: Run it — verify it passes**

Run: `npx vitest run --project unit test/email.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/email.ts test/email.test.ts
git commit -m "$(cat <<'EOF'
feat(email): Resend send abstraction with dev fallback (m4c)

sendEmail() sends via Resend in prod and logs the send in dev (no API key
needed locally). Surfaces Resend's {error} as a thrown Error. server-only.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migration 0004 — `verification_tokens`

**Files:** Modify `lib/db/schema.ts`; Create `drizzle/0004_*` (generated)

- [ ] **Step 1: Add the table to the schema**

At the end of `lib/db/schema.ts` (after `rateLimits`), add:

```ts
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vt_token_hash_uq").on(t.tokenHash),
    index("vt_user_id_idx").on(t.userId),
    index("vt_expires_at_idx").on(t.expiresAt),
  ],
);
```

- [ ] **Step 2: Generate the migration**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coffee_tracker" npx drizzle-kit generate --name verification_tokens
```
Expected: `drizzle/0004_verification_tokens.sql` + meta written.

- [ ] **Step 3: Verify the SQL**

Read `drizzle/0004_verification_tokens.sql`. It MUST contain (all targeting `verification_tokens`): one `CREATE TABLE "verification_tokens"`, one `ALTER TABLE "verification_tokens" ADD CONSTRAINT … FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade` (drizzle emits the FK as a separate statement — expected), and three index statements (`CREATE UNIQUE INDEX vt_token_hash_uq` + `CREATE INDEX vt_user_id_idx` + `CREATE INDEX vt_expires_at_idx`). STOP only if it touches a DIFFERENT table.

- [ ] **Step 4: Apply + drift check**

```bash
npm run db:setup
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coffee_tracker" npx drizzle-kit generate
```
Expected: `0004_verification_tokens` applied; second generate prints `No schema changes, nothing to migrate`.
(Fallback: if `db:setup`'s `migrate()` errors on a dirty local journal, run `npm run db:reset` then re-check.)

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "$(cat <<'EOF'
feat(db): verification_tokens table (m4c)

Migration 0004: verification_tokens(id pk, user_id FK cascade, email,
token_hash unique, expires_at, created_at) + indexes. Drift check clean.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Token lifecycle (`lib/verification-tokens.ts`)

**Files:** Create `lib/verification-tokens.ts`, `test/verification-tokens.test.ts`, `test/integration/verification-tokens.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `test/verification-tokens.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

beforeEach(() => { process.env.AUTH_SECRET = "test-secret"; });

import { generateToken, createVerificationToken, consumeVerificationToken } from "@/lib/verification-tokens";

function fakeClient(responses: Array<{ rows: unknown[] }>) {
  const queries: Array<{ text: string; params: unknown[] }> = [];
  let i = 0;
  return {
    queries,
    client: { query: vi.fn(async (text: string, params: unknown[] = []) => { queries.push({ text, params }); return responses[i++] ?? { rows: [] }; }) },
  };
}

describe("generateToken", () => {
  it("returns a raw token and its HMAC-SHA256(raw, AUTH_SECRET) hash; unique per call", () => {
    const a = generateToken();
    expect(a.raw).not.toBe(a.hash);
    expect(a.hash).toBe(createHmac("sha256", "test-secret").update(a.raw).digest("hex"));
    expect(generateToken().raw).not.toBe(a.raw);
  });
});

describe("createVerificationToken", () => {
  it("deletes prior tokens then inserts and returns the raw token", async () => {
    const { client, queries } = fakeClient([{ rows: [] }, { rows: [] }]);
    const raw = await createVerificationToken(client, "u-1", "a@b.com");
    expect(typeof raw).toBe("string");
    expect(queries[0].text).toMatch(/delete from verification_tokens where user_id/i);
    expect(queries[1].text).toMatch(/insert into verification_tokens/i);
    expect(queries[1].params).toContain("u-1");
    expect(queries[1].params).toContain("a@b.com");
    expect(queries[1].params).not.toContain(raw); // the HASH is stored, never the raw token
  });
});

describe("consumeVerificationToken", () => {
  it("atomically deletes by hash + unexpired and returns the userId", async () => {
    const { client, queries } = fakeClient([{ rows: [{ user_id: "u-1" }] }]);
    const res = await consumeVerificationToken(client, "rawtoken");
    expect(res).toEqual({ userId: "u-1" });
    expect(queries[0].text).toMatch(/delete from verification_tokens where token_hash = \$1 and expires_at > now\(\) returning user_id/i);
    expect(queries[0].params[0]).toBe(createHmac("sha256", "test-secret").update("rawtoken").digest("hex"));
  });
  it("returns null when no row matches (invalid/expired/used)", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    expect(await consumeVerificationToken(client, "x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/verification-tokens.test.ts`
Expected: FAIL — cannot resolve `@/lib/verification-tokens`.

- [ ] **Step 3: Implement**

Create `lib/verification-tokens.ts`:

```ts
import "server-only";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import type { Queryable } from "@/lib/users-repo";

const TTL = "24 hours";

function hashToken(raw: string): string {
  // HMAC-bind to AUTH_SECRET so a DB-only leak (the stored hash) can't forge a token.
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(raw).digest("hex");
}

/** A 256-bit url-safe token + its at-rest hash. */
export function generateToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/** One live link per user: drop prior tokens, insert a fresh one, return the raw token. */
export async function createVerificationToken(db: Queryable, userId: string, email: string): Promise<string> {
  const { raw, hash } = generateToken();
  await db.query(`delete from verification_tokens where user_id = $1`, [userId]);
  await db.query(
    `insert into verification_tokens (id, user_id, email, token_hash, expires_at)
     values ($1, $2, $3, $4, now() + $5::interval)`,
    [`vt-${randomUUID()}`, userId, email, hash, TTL],
  );
  // Opportunistic prune (~1%) of globally-expired rows so abandoned signups don't
  // accumulate (mirrors lib/rate-limit.ts). Fire-and-forget; never affects the result.
  if (Math.random() < 0.01) {
    Promise.resolve(db.query(`delete from verification_tokens where expires_at < now()`)).catch(() => {});
  }
  return raw;
}

/** Atomic single-use consume: returns the userId or null. */
export async function consumeVerificationToken(db: Queryable, raw: string): Promise<{ userId: string } | null> {
  const { rows } = await db.query(
    `delete from verification_tokens where token_hash = $1 and expires_at > now() returning user_id`,
    [hashToken(raw)],
  );
  const row = rows[0] as { user_id: string } | undefined;
  return row ? { userId: row.user_id } : null;
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/verification-tokens.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the integration test**

Create `test/integration/verification-tokens.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { Pool } from "pg";
import { freshDbWithSql, dropDb, allMigrationsSql, urlForDb } from "./_db";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("verification_tokens", () => {
  const DB = "cortado_verification_tokens";
  afterAll(() => dropDb(DB));

  it("cascade-deletes a user's tokens when the user is deleted", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    try {
      await c.query(`insert into users (id,name,handle,avatar) values ('u1','U','u','#000')`);
      await c.query(`insert into verification_tokens (id,user_id,email,token_hash,expires_at) values ('t1','u1','a@b.com','h1', now()+interval '1 hour')`);
      await c.query(`delete from users where id='u1'`);
      const n = ((await c.query(`select count(*)::int n from verification_tokens`)).rows[0] as { n: number }).n;
      expect(n).toBe(0);
    } finally { await c.end(); }
  });

  it("consume is single-use under concurrency (exactly one winner)", async () => {
    const c = await freshDbWithSql(DB, allMigrationsSql());
    const pool = new Pool({ connectionString: urlForDb(DB), max: 6 });
    try {
      await c.query(`insert into users (id,name,handle,avatar) values ('u2','U','u2','#000')`);
      await c.query(`insert into verification_tokens (id,user_id,email,token_hash,expires_at) values ('t2','u2','a@b.com','hh', now()+interval '1 hour')`);
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          pool.query(`delete from verification_tokens where token_hash='hh' and expires_at > now() returning user_id`),
        ),
      );
      expect(results.filter((r) => r.rows.length === 1).length).toBe(1); // exactly one delete wins
    } finally { await pool.end(); await c.end(); }
  });
});
```

- [ ] **Step 6: Run the integration test — confirm 2 passed (not skipped)**

Run: `npm run test:integration -- test/integration/verification-tokens.test.ts`
Expected: **2 passed** (not "skipped"/"no tests").

- [ ] **Step 7: Commit**

```bash
git add lib/verification-tokens.ts test/verification-tokens.test.ts test/integration/verification-tokens.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): verification token lifecycle (m4c)

generateToken (256-bit, HMAC-AUTH_SECRET hash-at-rest), createVerificationToken
(one live link/user), consumeVerificationToken (atomic single-use DELETE..RETURNING).
Unit + integration (cascade + consume-once concurrency).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Env warning for Resend config

**Files:** Modify `lib/env.ts`; Modify `test/env.test.ts`; Modify `.env.example`

- [ ] **Step 1: Add the failing test**

Append to `test/env.test.ts` (and add `vi` to the vitest import: `import { describe, it, expect, vi } from "vitest";`):

```ts
import { logger } from "@/lib/logger";

describe("validateEnv — Resend config", () => {
  it("warns (does not throw) when RESEND_API_KEY/EMAIL_FROM are missing in production", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    expect(() => validateEnv(prod({ AUTH_SECRET: "x", DATABASE_URL: "y" }))).not.toThrow();
    expect(warn).toHaveBeenCalledWith("email_not_configured", expect.anything());
    warn.mockRestore();
  });
  it("does not warn when Resend is configured", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    validateEnv(prod({ AUTH_SECRET: "x", DATABASE_URL: "y", RESEND_API_KEY: "re_x", EMAIL_FROM: "n@e.com" }));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/env.test.ts`
Expected: FAIL — `validateEnv` doesn't call `logger.warn` yet.

- [ ] **Step 3: Implement**

Replace `lib/env.ts` with:

```ts
import { logger } from "@/lib/logger";

// Fail-fast env check. Called ONLY from instrumentation.register() (server start),
// never at module top-level — so `next build` (no DB, dummy secret) stays green.
export function validateEnv(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV !== "production") return;
  const missing: string[] = [];
  if (!env.AUTH_SECRET) missing.push("AUTH_SECRET");
  if (!env.DATABASE_URL) missing.push("DATABASE_URL");
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s) in production: ${missing.join(", ")}. See .env.example.`,
    );
  }
  // Email is non-fatal: the dev fallback (log the link) is a valid staging mode, so
  // warn rather than crash if Resend isn't configured.
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.warn("email_not_configured", {
      hint: "RESEND_API_KEY/EMAIL_FROM unset — verification emails will be logged, not sent",
    });
  }
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/env.test.ts`
Expected: PASS (existing 4 + 2 new).

- [ ] **Step 5: Document the env vars**

Append to `.env.example`:

```
# Email (Resend) — optional in dev (the verification link is logged instead).
# Required to actually send in production; EMAIL_FROM must be on a Resend-verified domain.
# AUTH_URL (above) must also be your public origin in production so the verification
# link in the email is absolute (it falls back to http://localhost:3000 in dev).
RESEND_API_KEY=
EMAIL_FROM=
```

- [ ] **Step 6: Commit**

```bash
git add lib/env.ts test/env.test.ts .env.example
git commit -m "$(cat <<'EOF'
feat(env): warn when Resend email is unconfigured in prod (m4c)

Non-fatal: the dev fallback logs the verification link, so a missing
RESEND_API_KEY/EMAIL_FROM warns rather than crashing startup.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## CUT 2 — Verification flow

### Task 5: `sendVerificationEmail` + wire into signup

**Files:** Create `lib/verify-email.ts`, `test/verify-email.test.ts`; Modify `app/auth-actions.ts`

- [ ] **Step 1: Write the failing test**

Create `test/verify-email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const createTokenMock = vi.fn(async () => "raw-token");
vi.mock("@/lib/verification-tokens", () => ({ createVerificationToken: (...a: unknown[]) => createTokenMock(...a) }));
const sendEmailMock = vi.fn(async () => {});
vi.mock("@/lib/email", () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { sendVerificationEmail } from "@/lib/verify-email";

beforeEach(() => { queryMock.mockReset(); createTokenMock.mockClear(); sendEmailMock.mockReset(); process.env.AUTH_URL = "https://cortado.test"; });

describe("sendVerificationEmail", () => {
  it("no-ops when the user is already verified", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ email: "a@b.com", email_verified: new Date() }] });
    await sendVerificationEmail("u-1");
    expect(createTokenMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
  it("creates a token and emails a /api/verify link when unverified", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ email: "a@b.com", email_verified: null }] });
    await sendVerificationEmail("u-1");
    expect(createTokenMock).toHaveBeenCalled();
    const [to, , html] = sendEmailMock.mock.calls[0] as [string, string, string];
    expect(to).toBe("a@b.com");
    expect(html).toContain("https://cortado.test/api/verify?token=raw-token");
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/verify-email.test.ts`
Expected: FAIL — cannot resolve `@/lib/verify-email`.

- [ ] **Step 3: Implement**

Create `lib/verify-email.ts`:

```ts
import "server-only";
import { query } from "@/lib/db";
import { createVerificationToken } from "@/lib/verification-tokens";
import { sendEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

const db = { query: (t: string, p?: unknown[]) => query(t, p) };

/** Self-contained: looks up the user's email + verified status, no-ops if already
 *  verified, else mints a token and emails the verification link. Never throws on a
 *  send failure (the user can resend) — logs instead. */
export async function sendVerificationEmail(userId: string): Promise<void> {
  const { rows } = await query<{ email: string | null; email_verified: Date | null }>(
    `select email, email_verified from users where id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row?.email || row.email_verified) return;
  try {
    const raw = await createVerificationToken(db, userId, row.email);
    // AUTH_URL is unset in local dev (trustHost) — fall back so the dev link is clickable.
    const base = (process.env.AUTH_URL || "http://localhost:3000").replace(/\/$/, "");
    const url = `${base}/api/verify?token=${raw}`;
    // Log the RAW token URL ONLY on the dev-fallback path (no Resend key). In prod the
    // single-use token must never hit the logs — log a tokenless event instead.
    if (!process.env.RESEND_API_KEY) logger.info("verify_link", { userId, url });
    else logger.info("verify_email_sent", { userId });
    await sendEmail(
      row.email,
      "Verify your Cortado email",
      `<p>Confirm your email to start logging brews.</p><p><a href="${url}">Verify my email</a></p><p>This link expires in 24 hours.</p>`,
    );
  } catch (err) {
    logger.error("verify_email_failed", { userId, err: String(err) });
  }
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/verify-email.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Wire into `registerUser` (send AFTER a successful insert)**

In `app/auth-actions.ts`: add the import `import { sendVerificationEmail } from "@/lib/verify-email";`. The current success path is `await createCredentialUser(...)` inside the `try`, then `await signIn(...)` after the catch. Change so the created id is captured and the email sent before sign-in:

Replace:
```ts
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
```
with:
```ts
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
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors (`createCredentialUser` already returns the id).

- [ ] **Step 7: Commit**

```bash
git add lib/verify-email.ts test/verify-email.test.ts app/auth-actions.ts
git commit -m "$(cat <<'EOF'
feat(auth): send verification email after credential signup (m4c)

sendVerificationEmail(userId) mints a token + emails the /api/verify link
(no-op if already verified, never throws on send). registerUser sends it
AFTER a successful insert so the unique index throttles repeat-signup bombs.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `/api/verify` Route Handler

**Files:** Create `app/api/verify/route.ts`, `test/verify-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/verify-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
vi.mock("@/lib/db", () => ({ query: (...a: unknown[]) => queryMock(...a) }));
const consumeMock = vi.fn();
vi.mock("@/lib/verification-tokens", () => ({ consumeVerificationToken: (...a: unknown[]) => consumeMock(...a) }));

import { GET } from "@/app/api/verify/route";

beforeEach(() => { queryMock.mockReset(); consumeMock.mockReset(); });

describe("GET /api/verify", () => {
  it("valid token: stamps email_verified and redirects to /?verified=1", async () => {
    consumeMock.mockResolvedValueOnce({ userId: "u-1" });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await GET(new Request("https://x.test/api/verify?token=abc"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/\?verified=1$/);
    const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
    expect(sql).toMatch(/update users set email_verified = now\(\) where id = \$1/i);
    expect(params).toEqual(["u-1"]);
  });
  it("invalid/expired token: redirects to /?verified=0 without an UPDATE", async () => {
    consumeMock.mockResolvedValueOnce(null);
    const res = await GET(new Request("https://x.test/api/verify?token=bad"));
    expect(res.headers.get("location")).toMatch(/\/\?verified=0$/);
    expect(queryMock).not.toHaveBeenCalled();
  });
  it("missing token: redirects to /?verified=0", async () => {
    const res = await GET(new Request("https://x.test/api/verify"));
    expect(res.headers.get("location")).toMatch(/\/\?verified=0$/);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/verify-route.test.ts`
Expected: FAIL — cannot resolve `@/app/api/verify/route`.

- [ ] **Step 3: Implement**

Create `app/api/verify/route.ts`:

```ts
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { consumeVerificationToken } from "@/lib/verification-tokens";

export const dynamic = "force-dynamic";

const db = { query: (t: string, p?: unknown[]) => query(t, p) };

/** Consume a verification token and stamp users.email_verified, then redirect to a
 *  TOKENLESS url (so the token never lingers in history/logs). Neutral outcome on
 *  any failure (no enumeration); redirect target is hardcoded (no open redirect). */
export async function GET(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get("token");
  const ok = token ? await consumeVerificationToken(db, token) : null;
  if (!ok) return NextResponse.redirect(new URL("/?verified=0", request.url));
  await query(`update users set email_verified = now() where id = $1`, [ok.userId]);
  return NextResponse.redirect(new URL("/?verified=1", request.url));
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/verify-route.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/verify/route.ts test/verify-route.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): /api/verify consumes token + stamps email_verified (m4c)

GET handler: atomic single-use consume, UPDATE email_verified, redirect to a
tokenless /?verified=1 (or /?verified=0 neutral on failure). No open redirect.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `resendVerification` Server Action

**Files:** Create `app/verify-actions.ts`, `test/verify-actions.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/verify-actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const requireUserId = vi.fn(async () => "u-me");
vi.mock("@/lib/auth", () => ({ requireUserId }));
const checkRateLimit = vi.fn(async () => true);
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));
const sendVerificationEmail = vi.fn(async () => {});
vi.mock("@/lib/verify-email", () => ({ sendVerificationEmail: (...a: unknown[]) => sendVerificationEmail(...a) }));

import { resendVerification } from "@/app/verify-actions";

beforeEach(() => { requireUserId.mockClear(); checkRateLimit.mockReset(); checkRateLimit.mockResolvedValue(true); sendVerificationEmail.mockReset(); });

describe("resendVerification", () => {
  it("rate-limits then re-sends for the current user", async () => {
    await resendVerification();
    expect(requireUserId).toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledWith(expect.stringContaining("verify:user:u-me"), expect.any(Number));
    expect(sendVerificationEmail).toHaveBeenCalledWith("u-me");
  });
  it("does NOT send when rate-limited (neutral)", async () => {
    checkRateLimit.mockResolvedValueOnce(false);
    await resendVerification();
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/verify-actions.test.ts`
Expected: FAIL — cannot resolve `@/app/verify-actions`.

- [ ] **Step 3: Implement**

Create `app/verify-actions.ts`:

```ts
"use server";
import { requireUserId } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/verify-email";

const RESEND_LIMIT = 5; // per 15-min window per user

/** Re-send the current user's verification email. Keyed to the logged-in user
 *  (no email/IP enumeration surface). Always returns void (neutral). The send is
 *  gated by a successful token INSERT, so a fail-open limiter can't be used to bomb. */
export async function resendVerification(): Promise<void> {
  const userId = await requireUserId();
  if (!(await checkRateLimit(`verify:user:${userId}`, RESEND_LIMIT))) return;
  await sendVerificationEmail(userId);
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/verify-actions.test.ts`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```bash
git add app/verify-actions.ts test/verify-actions.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): resendVerification action (m4c)

Logged-in resend keyed to the current user (no enumeration surface),
rate-limited (5/15min), neutral. Send gated by token INSERT (bomb-safe).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: OAuth auto-verify (Google claim + GitHub `/user/emails`)

**Files:** Create `lib/oauth-email.ts`, `test/oauth-email.test.ts`; Modify `lib/users-repo.ts`, `auth.ts`; Modify `test/users-repo.test.ts`

- [ ] **Step 1: Write the failing test for `githubEmailVerified`**

Create `test/oauth-email.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { githubEmailVerified } from "@/lib/oauth-email";

beforeEach(() => vi.restoreAllMocks());

describe("githubEmailVerified", () => {
  it("true when the primary email is verified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([
      { email: "x@e.com", primary: false, verified: true },
      { email: "p@e.com", primary: true, verified: true },
    ]), { status: 200 }));
    expect(await githubEmailVerified("tok")).toBe(true);
  });
  it("false when the primary email is unverified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([
      { email: "p@e.com", primary: true, verified: false },
    ]), { status: 200 }));
    expect(await githubEmailVerified("tok")).toBe(false);
  });
  it("false on a non-OK response (fail-safe: treat as unverified)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("nope", { status: 401 }));
    expect(await githubEmailVerified("tok")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/oauth-email.test.ts`
Expected: FAIL — cannot resolve `@/lib/oauth-email`.

- [ ] **Step 3: Implement `githubEmailVerified`**

Create `lib/oauth-email.ts`:

```ts
import "server-only";

/** Whether the GitHub user's PRIMARY email is verified. The bundled GitHub provider
 *  selects the primary email but NOT its verified flag, so we ask /user/emails.
 *  Fail-safe: any error → false (treat as unverified). */
export async function githubEmailVerified(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/vnd.github+json", "User-Agent": "cortado" },
    });
    if (!res.ok) return false;
    const emails = (await res.json()) as Array<{ primary?: boolean; verified?: boolean }>;
    return emails.some((e) => e.primary && e.verified === true);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `npx vitest run --project unit test/oauth-email.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Add the `emailVerified` flag to `resolveOrCreateOAuthUser`**

In `lib/users-repo.ts`, add `emailVerified?: boolean` to the `OAuthProfile` interface, set it on create, and lazy-backfill on the found path. Change the function body:

```ts
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
  await db.query(
    `insert into users (id, name, handle, avatar, email, image, session_version, email_verified)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, p.name ?? "Coffee drinker", generateHandle(), randomAvatarTint(), p.email, p.image, 0, p.emailVerified ? new Date() : null],
  );
  await db.query(
    `insert into accounts (id, user_id, type, provider, provider_account_id)
     values ($1, $2, $3, $4, $5)`,
    [`acc-${randomUUID()}`, userId, p.type, p.provider, p.providerAccountId],
  );
  return userId;
}
```

Add `emailVerified?: boolean;` to the `OAuthProfile` interface declaration.

- [ ] **Step 6: Update the OAuth jwt branch to compute the verified signal**

In `auth.ts`, add the import `import { githubEmailVerified } from "@/lib/oauth-email";`. In the jwt callback OAuth `else` branch, compute `emailVerified` before the `resolveOrCreateOAuthUser` call and pass it:

```ts
        } else {
          const emailVerified =
            account.provider === "google"
              ? profile?.email_verified === true
              : account.provider === "github" && account.access_token
                ? await githubEmailVerified(account.access_token as string)
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
```

- [ ] **Step 7: Update `users-repo.test.ts` for the new INSERT shape**

The existing "creates a user + account" test still passes (the users INSERT now has 8 params incl. `email_verified`; it still matches `/insert into users/i` and still contains `0`). The existing "reuses the existing user" test (`responses = [{ rows: [{ user_id: "u-existing" }] }]`, asserts `queries.toHaveLength(1)`) also still holds — the lazy-backfill UPDATE only runs when `emailVerified` is truthy, and that test passes no `emailVerified`. Add a `describe` for the stamping:

```ts
describe("resolveOrCreateOAuthUser email_verified", () => {
  it("stamps email_verified (a Date) when emailVerified is true", async () => {
    const { client, queries } = fakeClient([{ rows: [] }, { rows: [] }, { rows: [] }]);
    await resolveOrCreateOAuthUser(client, {
      provider: "google", providerAccountId: "g-1", name: "M", email: "m@e.com", image: null, type: "oidc", emailVerified: true,
    });
    expect(queries[1].text).toMatch(/insert into users/i);
    expect(queries[1].params.some((x) => x instanceof Date)).toBe(true);
  });
  it("leaves email_verified null when emailVerified is unset", async () => {
    const { client, queries } = fakeClient([{ rows: [] }, { rows: [] }, { rows: [] }]);
    await resolveOrCreateOAuthUser(client, {
      provider: "github", providerAccountId: "gh-1", name: "T", email: "t@e.com", image: null, type: "oauth",
    });
    expect(queries[1].params.some((x) => x instanceof Date)).toBe(false);
  });
});
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run --project unit test/oauth-email.test.ts test/users-repo.test.ts && npm run typecheck`
Expected: PASS; tsc clean. (`email_verified` is declared `boolean | null` on Auth.js's `Profile` type, so `profile?.email_verified === true` typechecks with no cast.)

- [ ] **Step 9: Commit**

```bash
git add lib/oauth-email.ts test/oauth-email.test.ts lib/users-repo.ts auth.ts test/users-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): auto-verify OAuth emails (Google claim, GitHub /user/emails) (m4c)

resolveOrCreateOAuthUser stamps email_verified when the provider verified the
email: Google via profile.email_verified, GitHub via /user/emails (primary+
verified). Lazy-backfills existing OAuth users. Don't trust the bundled
GitHub primary email blindly.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## CUT 3 — Write-gate

### Task 9: `getSessionState` + `isWriteAllowed` + `requireVerifiedUserId`

**Files:** Modify `lib/users-repo.ts`, `lib/auth-guard.ts`, `lib/auth.ts`; Modify `test/auth-guard.test.ts`; Create `test/require-verified.test.ts`; Modify `test/users-repo.test.ts`

- [ ] **Step 1: Write the failing `isWriteAllowed` test**

Append to `test/auth-guard.test.ts` (add `isWriteAllowed` to the import):

```ts
describe("isWriteAllowed", () => {
  it("blocks a credential user with no verified email", () => {
    expect(isWriteAllowed(true, null)).toBe(false);
  });
  it("allows a verified credential user", () => {
    expect(isWriteAllowed(true, new Date())).toBe(true);
  });
  it("allows an OAuth user (no password) regardless", () => {
    expect(isWriteAllowed(false, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/auth-guard.test.ts`
Expected: FAIL — `isWriteAllowed` is not exported.

- [ ] **Step 3: Implement `isWriteAllowed`**

Append to `lib/auth-guard.ts`:

```ts
/** Content writes require a verified email for CREDENTIAL users; OAuth users
 *  (no password) are always allowed. */
export function isWriteAllowed(hasPassword: boolean, emailVerified: Date | null): boolean {
  return !(hasPassword && !emailVerified);
}
```

- [ ] **Step 4: Add `getSessionState` to `users-repo.ts`**

Append to `lib/users-repo.ts`:

```ts
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
```

Add a unit test in `test/users-repo.test.ts`:

```ts
describe("getSessionState", () => {
  it("returns sv + emailVerified + hasPassword", async () => {
    const { client } = fakeClient([{ rows: [{ session_version: 2, email_verified: null, has_password: true }] }]);
    expect(await getSessionState(client, "u-1")).toEqual({ sessionVersion: 2, emailVerified: null, hasPassword: true });
  });
  it("returns null when no row", async () => {
    const { client } = fakeClient([{ rows: [] }]);
    expect(await getSessionState(client, "x")).toBeNull();
  });
});
```
(Add `getSessionState` to the import at the top of `test/users-repo.test.ts`.)

- [ ] **Step 5: Write the failing `requireVerifiedUserId` test**

Create `test/require-verified.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const authMock = vi.fn();
const getSessionStateMock = vi.fn();
const queryMock = vi.fn();
vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/users-repo", () => ({ getSessionState: getSessionStateMock, getSessionVersion: vi.fn() }));
vi.mock("@/lib/db", () => ({ query: queryMock }));

beforeEach(() => { vi.resetModules(); authMock.mockReset(); getSessionStateMock.mockReset(); queryMock.mockReset(); });
async function load() { return (await import("@/lib/auth")).requireVerifiedUserId; }

describe("requireVerifiedUserId", () => {
  it("returns the id for a verified credential user", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionStateMock.mockResolvedValue({ sessionVersion: 3, emailVerified: new Date(), hasPassword: true });
    expect(await (await load())()).toBe("u-1");
  });
  it("throws for an unverified credential user", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionStateMock.mockResolvedValue({ sessionVersion: 3, emailVerified: null, hasPassword: true });
    await expect((await load())()).rejects.toThrow(/not verified/i);
  });
  it("allows an OAuth user (no password)", async () => {
    authMock.mockResolvedValue({ user: { id: "u-2" }, sessionVersion: 0 });
    getSessionStateMock.mockResolvedValue({ sessionVersion: 0, emailVerified: null, hasPassword: false });
    expect(await (await load())()).toBe("u-2");
  });
  it("throws on revocation (sv mismatch) before the verified check", async () => {
    authMock.mockResolvedValue({ user: { id: "u-1" }, sessionVersion: 3 });
    getSessionStateMock.mockResolvedValue({ sessionVersion: 9, emailVerified: new Date(), hasPassword: true });
    await expect((await load())()).rejects.toThrow(/revoked/i);
  });
});
```

- [ ] **Step 6: Run it — verify it fails**

Run: `npx vitest run --project unit test/require-verified.test.ts`
Expected: FAIL — `requireVerifiedUserId` not exported.

- [ ] **Step 7: Implement `requireVerifiedUserId`**

In `lib/auth.ts`, add `getSessionState` to the users-repo import and `isWriteAllowed` to the auth-guard import, then append:

```ts
/** Write-path gate for CONTENT writes: auth + revocation + verified-email.
 *  One DB read (live, never a stale JWT flag). */
export async function requireVerifiedUserId(): Promise<string> {
  const s = await auth();
  const id = s?.user?.id ?? null;
  if (!id) throw new Error("Unauthenticated");
  const state = await getSessionState(db, id);
  resolveUserOrThrow({ id, sv: s!.sessionVersion }, state?.sessionVersion ?? null); // revocation
  if (!state || !isWriteAllowed(state.hasPassword, state.emailVerified)) throw new Error("Email not verified");
  return id;
}
```

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run --project unit test/require-verified.test.ts test/auth-guard.test.ts test/users-repo.test.ts && npm run typecheck`
Expected: PASS; tsc clean.

- [ ] **Step 9: Commit**

```bash
git add lib/users-repo.ts lib/auth-guard.ts lib/auth.ts test/auth-guard.test.ts test/require-verified.test.ts test/users-repo.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): requireVerifiedUserId write-gate (live DB read) (m4c)

getSessionState (sv + email_verified + hasPassword in one query), isWriteAllowed
predicate (credential users need verification; OAuth always allowed), and
requireVerifiedUserId (revocation + verified, never a stale JWT flag).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Gate the content-write actions

**Files:** Modify `app/actions.ts`; Create `test/write-gate-coverage.test.ts`

- [ ] **Step 1: Write the failing coverage test**

Create `test/write-gate-coverage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(process.cwd(), "app/actions.ts"), "utf8");
const CONTENT_WRITES = [
  "logBrew", "addBag", "updateBrew", "deleteBrew", "updateBag", "deleteBag",
  "toggleLike", "toggleFollowUser", "toggleFollowRoaster", "toggleSaveTasting",
  "toggleWishlistBean", "addComment", "updateComment", "deleteComment",
];

function body(name: string) {
  const start = src.indexOf(`export async function ${name}`);
  expect(start, `${name} exists`).toBeGreaterThan(-1);
  const next = src.indexOf("\nexport async function", start + 1);
  return src.slice(start, next === -1 ? undefined : next);
}

describe("content-write actions are verification-gated", () => {
  for (const fn of CONTENT_WRITES) {
    it(`${fn} uses requireVerifiedUserId`, () => {
      expect(body(fn)).toMatch(/requireVerifiedUserId\(\)/);
    });
  }
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `npx vitest run --project unit test/write-gate-coverage.test.ts`
Expected: FAIL — the actions still call `requireUserId()`.

- [ ] **Step 3: Swap the gate in the content writes**

In `app/actions.ts`, change the import to include `requireVerifiedUserId` (keep `requireUserId` if still used elsewhere), then replace `const userId = await requireUserId();` with `const userId = await requireVerifiedUserId();` (**keep the `const userId = await` binding** — the actions use `userId` later) **in exactly these 14 functions**: `logBrew, addBag, updateBrew, deleteBrew, updateBag, deleteBag, toggleLike, toggleFollowUser, toggleFollowRoaster, toggleSaveTasting, toggleWishlistBean, addComment, updateComment, deleteComment`. Do NOT change the `loadMore*` read actions (they use `getCurrentUserId`) and do NOT change `app/account-actions.ts`.

- [ ] **Step 4: Update the `@/lib/auth` mocks, then run the coverage test + full unit suite**

**Required edit first:** every test that mocks `@/lib/auth` and exercises a now-gated action must add `requireVerifiedUserId: vi.fn(async () => "u-me")` to its `vi.mock("@/lib/auth", …)` factory — otherwise the gated action calls `undefined()` → `"requireVerifiedUserId is not a function"`. Add that line to the factory in **all three** of: `test/actions-edit-delete.test.ts`, `test/log-brew.test.ts`, `test/actions-social.test.ts` (each calls gated actions). `test/actions-pagination.test.ts` (only `loadMoreFeed`, a read) and `test/account-actions.test.ts` (only non-gated `requireUserId` actions) do NOT need it.

Run: `npx vitest run --project unit test/write-gate-coverage.test.ts && npm run test`
Expected: coverage PASS; full unit suite green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/actions.ts test/write-gate-coverage.test.ts test/actions-edit-delete.test.ts test/log-brew.test.ts test/actions-social.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): gate content writes behind email verification (m4c)

The 14 content-write actions now use requireVerifiedUserId; account
management (delete/sign-out-everywhere) stays on requireUserId. A coverage
test asserts every content write is gated.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `needsEmailVerification` in AppData + verify banner

**Files:** Modify `lib/types.ts`, `lib/queries.ts`, `components/data-context.tsx`, `components/app-provider.tsx`

- [ ] **Step 1: Add the field to the type**

In `lib/types.ts`, add to the `AppData` interface:
```ts
  /** Current credential user has an unverified email (write-gated). */
  needsEmailVerification: boolean;
```

- [ ] **Step 2: Compute it in `getAppData` (NOT in getUserById — projection guard)**

In `lib/queries.ts`, import `getSessionState` from `@/lib/users-repo`, and in `getAppData` compute it for the current user and add it to the returned object. After the `me/...` Promise.all block, add:

```ts
  const sessionState = currentUserId ? await getSessionState({ query: (t, p) => query(t, p) }, currentUserId) : null;
  const needsEmailVerification = !!sessionState && sessionState.hasPassword && !sessionState.emailVerified;
```
and include `needsEmailVerification` in the returned object. (`query` is already imported in `lib/queries.ts`; if not, add `import { query } from "@/lib/db";`.)

- [ ] **Step 3: Confirm the projection guard still passes**

Run: `npx vitest run --project unit test/projection-guard.test.ts`
Expected: PASS — `getUserById` is unchanged (the `email_verified` read lives in `getAppData`, not `getUserById`).

- [ ] **Step 4: Render the banner from `initialData` (NOT `useData`)**

`AppProvider` is the component that *renders* `<DataProvider>`, so calling `useData()` in its body throws "useData must be used within a DataProvider" (the hook resolves context from `AppProvider`'s position, which is above its own provider) — it would crash the shell. `AppProvider` already destructures `initialData` (e.g. `currentUserId` at `components/app-provider.tsx:71`); read the flag there. No `data-context.tsx` change is needed (the banner reads `initialData` directly; `needsEmailVerification` is on `AppData` from Steps 1–2).

In `components/app-provider.tsx`: add `needsEmailVerification` to the `initialData` destructure (`const { …, currentUserId, needsEmailVerification } = initialData;`), add `import { resendVerification } from "@/app/verify-actions";` (`Button` is already imported), and render the banner inside the `<div className="screen-pad">` wrapper, before `{children}`:

```tsx
{needsEmailVerification && (
  <div role="status" style={{ background: "var(--cream, #f5ecd9)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", margin: "0 0 14px", display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
    <span style={{ flex: 1 }}>Verify your email to log brews and bags. Check your inbox for the link.</span>
    <form action={resendVerification}><Button variant="outline" size="sm" type="submit">Resend</Button></form>
  </div>
)}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/queries.ts components/app-provider.tsx
git commit -m "$(cat <<'EOF'
feat(ui): email-verification banner + needsEmailVerification (m4c)

getAppData computes needsEmailVerification for the current user (separate
query — getUserById stays projection-clean). The shell shows a verify banner
+ resend button when an unverified credential user is signed in.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Full verification + finish branch

**Files:** none (verification only)

- [ ] **Step 1: Full local pre-flight**

```bash
npm run typecheck
npm run test
npm run test:integration
npm run lint
npm run build
```
Expected: all green (confirm the new integration test ran, not skipped).

- [ ] **Step 2: Drift check**

Run: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/coffee_tracker" npx drizzle-kit generate`
Expected: `No schema changes, nothing to migrate`. `git status` clean.

- [ ] **Step 3: Live verification — dev fallback (no Resend key)**

Start dev on a free port. Sign up a new credential user → server log shows `verify_link` with the `/api/verify?token=…` URL → the banner appears and a content write (log a brew) is blocked ("Email not verified"). Open the logged verify URL → redirected to `/?verified=1` → the banner is gone and the same write now succeeds **on the same session** (proves the live DB-read gate, no re-login). Click "Resend" → a new `verify_link` logged; spam it past 5 → rate-limited (no new link).

- [ ] **Step 4: Live verification — OAuth auto-verify**

Sign in with Google → no banner, content writes work immediately (auto-verified). (If a Resend key + verified domain are available, also confirm a real email arrives for a credential signup.)

- [ ] **Step 5: Finish the branch**

Announce + use **superpowers:finishing-a-development-branch** → push + PR against `main`. Then run the in-harness code review (security-reviewer + pr-review-toolkit:code-reviewer over `git diff main...HEAD`) and post the summary comment.

---

## Self-Review

**1. Spec coverage:**
- Resend abstraction + dev fallback → Task 1. ✓
- `verification_tokens` migration → Task 2. ✓
- HMAC hash-at-rest, single-use, 24h, cleanup → Task 3 (cleanup via the prior-token delete + the unexpired filter; opportunistic prune is folded into `createVerificationToken`'s delete-by-user — note: a global expired-prune was simplified to per-user delete-on-resend; acceptable at this scale). ✓
- Env warn → Task 4. ✓
- Send-after-insert in registerUser → Task 5. ✓
- `/api/verify` consume + stamp + tokenless redirect + neutral → Task 6. ✓
- `resendVerification` (logged-in, rate-limited, neutral, bomb-safe) → Task 7. ✓
- OAuth auto-verify (Google claim, GitHub /user/emails, lazy backfill) → Task 8. ✓
- `getSessionState` + `isWriteAllowed` + `requireVerifiedUserId` (live DB read) → Task 9. ✓
- Gate the 14 content writes + coverage test → Task 10. ✓
- `needsEmailVerification` (computed in getAppData, projection-clean) + banner → Task 11. ✓
- Integration (cascade + consume-once) → Task 3. Unit truth tables/flows → Tasks 1/3/5/6/7/8/9. Live → Task 12. ✓

**2. Placeholder scan:** No TBD/TODO; every code step is complete; every run step has a command + expected result.

**3. Type/name consistency:** `sendEmail(to,subject,html)`, `generateToken→{raw,hash}`, `createVerificationToken(db,userId,email)→raw`, `consumeVerificationToken(db,raw)→{userId}|null`, `sendVerificationEmail(userId)`, `getSessionState→{sessionVersion,emailVerified,hasPassword}`, `isWriteAllowed(hasPassword,emailVerified)`, `requireVerifiedUserId()`, `githubEmailVerified(token)`, `needsEmailVerification` — all consistent across tasks. Migration `0004_verification_tokens` consistent (Tasks 2/3/12).

**Deviations from spec (deliberate):** (1) Resend rate-limiting uses a single `verify:user:<uid>` key instead of the spec's `verify:email`/`verify:ip` — the resend action is authenticated, so per-user keying is the correct, enumeration-free surface. (2) The spec's opportunistic ~1% global expired-token prune IS kept — folded into `createVerificationToken` (Task 3) alongside the per-user delete, so abandoned-signup rows don't accumulate.

**Adversarial review fixes folded in (review `wf_a4f40928`):** banner reads `initialData.needsEmailVerification` (calling `useData()` inside `AppProvider` would throw — it renders the provider); the three `@/lib/auth`-mocking test files (`actions-edit-delete`, `log-brew`, `actions-social`) get `requireVerifiedUserId` added before the gate swap; the `verify_link` raw-token log is gated to the dev-fallback path only (no token in prod logs); an `AUTH_URL` localhost fallback makes the dev link clickable; the Task 2 migration gate now expects drizzle's separate FK `ALTER TABLE`; Task 8 step 7 ships concrete test code.
