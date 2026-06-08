import { describe, it, expect, beforeAll, afterAll } from "vitest";
// account-link-repo + link-tokens take explicit args and import only @/lib/db —
// no @/lib/auth mock needed (unlike tests that import the server actions).
import { testPool } from "./_db";
import { getAuthMethods, linkAccount } from "@/lib/account-link-repo";
import { createLinkToken, consumeLinkToken } from "@/lib/link-tokens";
import { pool as appPool } from "@/lib/db";

const hasDb = !!process.env.DATABASE_URL;
const pool = hasDb ? testPool() : null;
const db = { query: (t: string, p?: unknown[]) => pool!.query(t, p) };

const TABLES = "users, accounts, link_tokens";

describe.skipIf(!hasDb)("account-linking repo + link-tokens", () => {
  beforeAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool!.query(`insert into users (id,name,handle,avatar,password_hash) values
      ('u-pw','Pat','pat','#000','x'),
      ('u-oauth','Ola','ola','#111', null)`);
    await pool!.query(`insert into accounts (id,user_id,type,provider,provider_account_id) values
      ('a1','u-pw','oauth','google','g-pw'),
      ('a2','u-oauth','oidc','github','gh-ola')`);
  });
  afterAll(async () => {
    await pool!.query(`truncate ${TABLES} restart identity cascade`);
    await pool?.end();
    await appPool.end();
  });

  it("getAuthMethods reports password + linked providers", async () => {
    expect(await getAuthMethods("u-pw")).toEqual({ hasPassword: true, providers: ["google"] });
    expect(await getAuthMethods("u-oauth")).toEqual({ hasPassword: false, providers: ["github"] });
  });

  it("consumeLinkToken is provider-scoped + single-use", async () => {
    const raw = await createLinkToken(db, "u-oauth", "google");
    expect(await consumeLinkToken(db, raw, "github")).toBeNull(); // wrong provider
    expect(await consumeLinkToken(db, raw, "google")).toEqual({ userId: "u-oauth" });
    expect(await consumeLinkToken(db, raw, "google")).toBeNull(); // already consumed
  });

  it("createLinkToken drops a prior token for the same (user, provider)", async () => {
    await createLinkToken(db, "u-oauth", "google");
    const raw2 = await createLinkToken(db, "u-oauth", "google");
    const { rows } = await pool!.query(`select count(*)::int as n from link_tokens where user_id=$1 and provider=$2`, ["u-oauth", "google"]);
    expect(rows[0].n).toBe(1);
    expect(await consumeLinkToken(db, raw2, "google")).toEqual({ userId: "u-oauth" });
  });

  it("linkAccount links, is idempotent for the same user, and rejects a takeover", async () => {
    // u-oauth links a fresh google identity → linked, with the real type stored.
    expect(await linkAccount("google", "g-new", "u-oauth", "oidc")).toBe("linked");
    const { rows } = await pool!.query(`select type from accounts where provider='google' and provider_account_id='g-new'`);
    expect(rows[0].type).toBe("oidc");
    // Same identity again for the same user → already (no dup row).
    expect(await linkAccount("google", "g-new", "u-oauth", "oidc")).toBe("already");
    // u-pw tries to claim the same google identity → taken; row still belongs to u-oauth.
    expect(await linkAccount("google", "g-new", "u-pw", "oidc")).toBe("taken");
    const owner = await pool!.query(`select user_id from accounts where provider='google' and provider_account_id='g-new'`);
    expect(owner.rows[0].user_id).toBe("u-oauth");
  });
});
